/**
 * Paid - Gmail Workspace Add-On (Google Apps Script)
 *
 * Configure in Script properties (Project Settings):
 *   PAID_API_BASE  e.g. https://paid-app.com
 *   PAID_API_KEY   Paste the key from your browser (see Settings note - Open Link is blocked in Gmail)
 *
 * Or use the "Connect Paid" card on first load to paste both values.
 *
 * "Edit in Gmail" uses CardService compose actions (scope gmail.addons.current.action.compose)
 * to open a normal compose window prefilled via GmailApp.createDraft.
 */

/** Deployed add-on version (bump when publishing a new deployment). */
var VERSION = '1.6.2';

var PROP_API = 'PAID_API_BASE';
var PROP_API_KEY = 'PAID_API_KEY';
var PROP_API_KEY_EXPIRES_AT = 'PAID_API_KEY_EXPIRES_AT';
var PROP_USER_DISPLAY_NAME = 'PAID_USER_DISPLAY_NAME';

/**
 * Default API base — Paid is single-tenant SaaS at paid-app.com. The legacy
 * "paste both URL and key" flow stays available for self-hosters via
 * onSavePaidSettings, but new installs should never have to type the URL.
 */
var DEFAULT_API_BASE = 'https://paid-app.com';

/**
 * Cohort dot swatches — circular PNGs hosted on paid-app.com. Were
 * solid square blocks via placehold.co before; the box shape made the
 * home card read as "boxy and primitive" (real feedback). These are
 * supersampled 64×64 anti-aliased circles, served behind Vercel's CDN.
 */
var DOT_90 = 'https://paid-app.com/marketplace/dot-red.png';
var DOT_60 = 'https://paid-app.com/marketplace/dot-orange.png';
var DOT_30 = 'https://paid-app.com/marketplace/dot-yellow.png';
var DOT_OK = 'https://paid-app.com/marketplace/dot-green.png';

/** Right-rail home: full outstanding view + cohort totals + Send All Reminders. */
function onGmailHomePage(e) {
  return buildHomePage_(e);
}

/** Any opened message: contextual invoice strip for participants. */
function onGmailMessageOpen(e) {
  return buildContextualForMessage_(e);
}

/** Composing a new email: contextual strip for To: recipients. */
function onGmailComposeOpen(e) {
  return buildContextualForCompose_(e);
}

/** Save config form (API base + Paid API key). */
function onSavePaidSettings(e) {
  var form =
    e.formInputs || (e.commonEventObject && e.commonEventObject.formInputs) || {};
  var base = getFormText_(form, 'api_base');
  var apiKey = getFormText_(form, 'api_key');
  if (base) PropertiesService.getUserProperties().setProperty(PROP_API, trimSlash_(base));
  if (apiKey) {
    PropertiesService.getUserProperties().setProperty(PROP_API_KEY, apiKey.trim());
    setApiKeyExpiry_(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

/** Clears PAID_API_BASE and PAID_API_KEY user properties. Run manually from the script editor (Run > clearPaidSettings) to reset stored credentials. */
function clearPaidSettings() {
  var p = PropertiesService.getUserProperties();
  p.deleteProperty(PROP_API);
  p.deleteProperty(PROP_API_KEY);
  p.deleteProperty(PROP_API_KEY_EXPIRES_AT);
  var all = p.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('paid_reminder_draft_') === 0) {
      p.deleteProperty(k);
    }
  });
}

/**
 * Step 1 - fetch AI draft from the backend and show preview (Send Now / Edit in Gmail).
 * Params: invoiceId, clientEmail (recipient for compose link).
 */
function onDraftReminder(e) {
  var id = e.parameters && e.parameters.invoiceId;
  var clientEmail = (e.parameters && e.parameters.clientEmail) || '';
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }

  try {
    // One round-trip generates ALL three tones in parallel server-side.
    // After this, onChangeTone swaps the visible tone locally with no network call.
    var res = paidFetch_('/api/invoices/draft-reminder-all-tones', {
      method: 'post',
      payload: JSON.stringify({
        invoiceId: id,
        senderName: getUserDisplayName_(),
      }),
    });
    if (res.statusCode === 404) {
      // Older deploy without all-tones — fall back to single-tone endpoint.
      res = paidFetch_('/api/invoices/draft-reminder', {
        method: 'post',
        payload: JSON.stringify({
          invoiceId: id,
          senderName: getUserDisplayName_(),
        }),
      });
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return CardService.newActionResponseBuilder()
          .setNotification(
            CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
          )
          .build();
      }
      var fallback = JSON.parse(res.body);
      cacheReminderDraft_(
        id,
        clientEmail,
        fallback.subject || '',
        fallback.body || '',
        fallback.tone || 'professional',
        !!fallback.payNowIncluded,
        null
      );
      // No toast — the draft is already visible in the next card.
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
        .build();
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    var autoTone = data.autoTone || 'professional';
    var allTones = data.tones || {};
    var picked = allTones[autoTone] || allTones.professional || allTones.friendly;
    if (!picked) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('Empty draft response.'))
        .build();
    }
    cacheReminderDraft_(
      id,
      clientEmail,
      picked.subject || '',
      picked.body || '',
      autoTone,
      !!picked.payNowIncluded,
      allTones
    );
    // No toast — the tone selector already shows "Friendly · Professional · Firm"
    // with the active one highlighted, so a bottom toast saying the same thing
    // just covers the draft body on mobile.
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_(
              'Your connection expired. Enter your API key below to reconnect.'
            )
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().updateCard(
          buildNotifyCard_(
            'Could not connect to Paid. Try again.',
            'onRefreshHome'
          )
        )
      )
      .build();
  }
}

/**
 * Open preview for a reminder already cached (e.g. 30+ day review queue after Send all).
 * Params: invoiceId only.
 */
function onShowQueuedDraft(e) {
  var id = e.parameters && e.parameters.invoiceId;
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }
  if (!loadReminderDraft_(id)) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          'Draft not found. Run Send all reminders again from the home card.'
        )
      )
      .build();
  }
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
    .build();
}

/**
 * Re-draft with a different tone. Calls /api/invoices/draft-reminder with a
 * tone override, replaces the cached draft, and re-renders the preview card
 * with the new tone selection highlighted.
 */
function onChangeTone(e) {
  var p = (e && e.parameters) || {};
  var id = p.invoiceId;
  var tone = p.tone;
  if (!id || !tone) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing tone'))
      .build();
  }

  var existing = loadReminderDraft_(id) || {};

  // Fast path: if we cached all three tones from the initial draft, swap locally
  // with zero network round-trip.
  if (existing.allTones && existing.allTones[tone]) {
    var pre = existing.allTones[tone];
    cacheReminderDraft_(
      id,
      existing.clientEmail || '',
      pre.subject || '',
      pre.body || '',
      tone,
      !!pre.payNowIncluded,
      existing.allTones
    );
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().updateCard(buildDraftPreviewCard_(String(id)))
      )
      .setNotification(
        CardService.newNotification().setText('Switched to ' + tone + ' tone.')
      )
      .build();
  }

  // Slow path (cache miss / older deployment): re-draft via the single-tone endpoint.
  try {
    var res = paidFetch_('/api/invoices/draft-reminder', {
      method: 'post',
      payload: JSON.stringify({
        invoiceId: id,
        senderName: getUserDisplayName_(),
        tone: tone,
      }),
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    cacheReminderDraft_(
      id,
      existing.clientEmail || '',
      data.subject || '',
      data.body || '',
      data.tone || tone,
      !!data.payNowIncluded,
      existing.allTones || null
    );
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().updateCard(buildDraftPreviewCard_(String(id)))
      )
      .setNotification(
        CardService.newNotification().setText('Re-drafted with ' + (data.tone || tone) + ' tone.')
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_(
              'Your connection expired. Enter your API key below to reconnect.'
            )
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Could not re-draft. Try again.')
      )
      .build();
  }
}

function capitalize_(s) {
  if (!s || typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Current Apps Script user's email, lowercased. Cached in script-scoped
 * memory so we don't pay Session API cost on every contextual render.
 * Returns '' if the userinfo.email scope isn't granted yet (shouldn't
 * happen post-install, but defensive).
 */
var _OWN_EMAIL_CACHE = null;
function getOwnEmailLower_() {
  if (_OWN_EMAIL_CACHE !== null) return _OWN_EMAIL_CACHE;
  try {
    var e = Session.getActiveUser().getEmail() || '';
    _OWN_EMAIL_CACHE = e.toLowerCase();
  } catch (err) {
    _OWN_EMAIL_CACHE = '';
  }
  return _OWN_EMAIL_CACHE;
}

/**
 * ISO timestamp → relative-friendly time string for log rows:
 *   - "2:15 PM" if today
 *   - "Yesterday 2:15 PM" if yesterday
 *   - "Mon 2:15 PM" if within last 7 days
 *   - "May 23" if older
 * This gives the History/Reminders log a real timeline feel and
 * disambiguates the 4 "May 23" rows by showing each send's actual time.
 */
function formatTimestamp_(iso) {
  if (!iso) return '';
  var d;
  try {
    d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  } catch (err) {
    return String(iso).slice(0, 10);
  }
  var now = new Date();
  var tz = Session.getScriptTimeZone();
  var sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return Utilities.formatDate(d, tz, 'h:mm a');
  }
  var yesterday = new Date(now.getTime() - 86400000);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return 'Yesterday ' + Utilities.formatDate(d, tz, 'h:mm a');
  }
  var diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays >= 0 && diffDays < 7) {
    return Utilities.formatDate(d, tz, 'EEE h:mm a');
  }
  return Utilities.formatDate(d, tz, 'MMM d');
}

/**
 * "2026-05-07T..." or "2026-05-07" → "May 7" so the History view reads as a
 * timeline instead of a wall of identical YYYY-MM-DD strings.
 */
function formatShortDate_(iso) {
  if (!iso || typeof iso !== 'string') return '';
  var datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
  var m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return datePart;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return datePart;
  return months[monthIdx] + ' ' + parseInt(m[3], 10);
}

/**
 * Build a Gmail compose URL prefilled with a templated response keyed to the
 * classifier's verdict. This is the "Draft response" button on classified
 * replies — the merchant taps it, Gmail opens a new compose with subject +
 * body already in place, they edit if needed and click Send.
 *
 * We do the templating client-side (no server round-trip) so the button
 * always fires fast and works even if the backend is mid-deploy.
 */
/**
 * Build a tone-tailored reply body keyed on classification. Returns plain
 * text. The body is also reused by the buildReplyDraftUrl_ legacy URL path
 * (kept for any caller that still wants a compose URL) and by the new
 * onDraftResponse compose-action handler, which is what the "Draft
 * response" button now uses — that opens an in-page draft sub-window
 * instead of jumping to a new browser tab.
 */
function buildReplyBody_(kind, promisedDate, ownName) {
  ownName = ownName || 'Paid';
  switch (kind) {
    case 'will_pay_later':
      return 'Hi,\n\n' +
        'Thanks for the update — really appreciate you keeping me posted. ' +
        (promisedDate
          ? "I'll plan to check in shortly after " + promisedDate + '. '
          : "I'll plan to follow up around your expected date. ") +
        "Let me know if anything changes before then.\n\n" +
        'Thanks,\n' + ownName;
    case 'cannot_pay':
      return 'Hi,\n\n' +
        "Thanks for being upfront — appreciate it. Let's find something that works on both ends. " +
        "Happy to set up a payment plan, accept a partial payment, or extend the due date. " +
        "What feels reasonable for you this month?\n\n" +
        'Thanks,\n' + ownName;
    case 'payment_plan_request':
      return 'Hi,\n\n' +
        "Happy to work with you on this. Two options that work on our end:\n" +
        "  - 3 monthly installments (equal thirds)\n" +
        "  - 50% now, 50% in 30 days\n\n" +
        "Either works, or if a different schedule fits your cash flow, just let me know.\n\n" +
        'Thanks,\n' + ownName;
    case 'invoice_issue':
      return 'Hi,\n\n' +
        "Thanks for flagging this. Could you tell me which line item is the concern? " +
        "I'll pull our records and get back to you today.\n\n" +
        'Thanks,\n' + ownName;
    case 'paid_already':
      return 'Hi,\n\n' +
        "Thanks for letting me know — I'll double-check our records. " +
        "If you have a check number, transfer date, or screenshot, that would help me reconcile faster. " +
        "I'll confirm receipt as soon as it shows up on our side.\n\n" +
        'Thanks,\n' + ownName;
    default:
      return 'Hi,\n\n' +
        "Thanks for the note. Let me know if there's anything else I can help with from my side.\n\n" +
        'Thanks,\n' + ownName;
  }
}

function buildReplyDraftUrl_(classificationRow, clientEmail) {
  var kind = (classificationRow && classificationRow.classification) || 'other';
  var promisedDate = (classificationRow && classificationRow.promisedPayDate) || '';
  var ownName = getUserDisplayName_() || 'Paid';
  var body = buildReplyBody_(kind, promisedDate, ownName);
  return 'https://mail.google.com/mail/?view=cm&fs=1' +
    '&to=' + encodeURIComponent(clientEmail || '') +
    '&su=' + encodeURIComponent('Re: Your invoice') +
    '&body=' + encodeURIComponent(body);
}

/**
 * Action handler for the "Draft response" button. Returns a compose action
 * response that opens a Gmail draft in an in-page sub-window (same UX as
 * "Edit in Gmail"). When the message is known (action fired from a card
 * inside an open thread), the draft is threaded as a REPLY so the
 * conversation stays in one thread on the client's side.
 */
function onDraftResponse(e) {
  var p = (e && e.parameters) || {};
  var kind = String(p.classification || 'other');
  var promisedDate = String(p.promisedPayDate || '');
  var clientEmail = String(p.clientEmail || '');
  var messageId = (e && e.gmail && e.gmail.messageId) || String(p.messageId || '');
  var ownName = getUserDisplayName_() || 'Paid';
  var body = buildReplyBody_(kind, promisedDate, ownName);

  var draft = null;
  if (messageId) {
    // Prefer createDraftReply — keeps the response threaded under the
    // client's reply, which is what every Gmail user expects when they
    // hit Reply in the message view.
    try {
      var msg = GmailApp.getMessageById(messageId);
      if (msg) {
        draft = msg.createDraftReply(body);
      }
    } catch (replyErr) { /* fall through to standalone draft */ }
  }
  if (!draft) {
    // Fallback for the (rare) case where messageId isn't usable —
    // e.g., action invoked from the home card with no open thread.
    var subject = 'Re: Your invoice';
    draft = GmailApp.createDraft(clientEmail, subject, body);
  }
  return CardService.newComposeActionResponseBuilder().setGmailDraft(draft).build();
}

/**
 * Minimal HTML escape for strings rendered with <b> wrappers in DecoratedText.
 * Apps Script's setText accepts a limited HTML subset, so we just need to
 * neutralize chars that could break tag parsing.
 */
function escapeHtml_(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Action: load and render full timeline for one invoice (reminders sent,
 * replies classified, scheduled follow-ups). Surfaces "what happened" and
 * "what's planned next" so the merchant can see their A/R workflow at a
 * glance without leaving Gmail.
 */
function onShowInvoiceHistory(e) {
  var p = (e && e.parameters) || {};
  var id = p.invoiceId;
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }

  try {
    var res = paidFetch_('/api/invoices/' + encodeURIComponent(id) + '/history', { method: 'get' });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildInvoiceHistoryCard_(data)))
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Enter your API key below to reconnect.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not load history. Try again.'))
      .build();
  }
}

/**
 * Manual classify: fetch the currently-open Gmail message, classify it,
 * and reload the History card. Wired to the "Classify the open reply"
 * button that appears in the History card empty-state when reminders have
 * been sent but no classifications exist yet.
 *
 * This is the unblock for cases where the contextual auto-classify path
 * silently failed (no logs surfaced to the user, no row in DB). Because
 * Apps Script populates e.gmail.messageId/accessToken on ALL add-on action
 * handlers — not just contextual triggers — we can run the same classify
 * flow from any button as long as a message is open in Gmail.
 */
function onManualClassifyFromHistory(e) {
  var p = (e && e.parameters) || {};
  var invoiceId = String(p.invoiceId || '');
  var invoiceClientEmail = String(p.clientEmail || '').toLowerCase();

  var messageId = e && e.gmail && e.gmail.messageId;
  var accessToken = e && e.gmail && e.gmail.accessToken;

  if (!messageId || !accessToken) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          'Open the client\'s reply email in Gmail first, then tap this button again.'
        )
      )
      .build();
  }

  try {
    var meta = extractMessageMeta_(messageId, accessToken);
    var fetchRes = fetchMessageTextWithStatus_(messageId, accessToken);
    var bodyText = fetchRes.text;
    if (!bodyText) {
      // Surface the specific failure reason from GmailApp so we know what to
      // fix. After the v1.6.0 switch to GmailApp this should almost never
      // trigger — most likely cause now is "message_not_found" if Gmail
      // hasn't fully synced the new message yet (retry helps).
      var detail = fetchRes.errorBody ? ' (' + fetchRes.errorBody + ')' : '';
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(
            'Could not read the open email' + detail + '. Make sure the reply thread is open in Gmail.'
          )
        )
        .build();
    }

    // Choose the client email: prefer the message's From: header if it's
    // not the merchant's own address; otherwise fall back to the invoice's
    // stored client_email so the server can link the row correctly even on
    // self-reply tests where From: is the merchant.
    var ownAddr = getOwnEmailLower_();
    var fromEmail = (meta && meta.from) || '';
    var clientEmail =
      fromEmail && fromEmail !== ownAddr
        ? fromEmail
        : invoiceClientEmail || '';

    var payload = {
      threadId: messageId,
      replyText: bodyText,
      invoiceId: invoiceId || undefined,
      auto: false,
    };
    if (clientEmail) payload.clientEmail = clientEmail;

    var res = paidFetch_(
      '/api/replies/classify',
      { method: 'post', payload: JSON.stringify(payload) },
      'manual-classify'
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(
            'Classify failed: ' + userFacingApiError_(res.statusCode, res.body)
          )
        )
        .build();
    }

    var data;
    try { data = JSON.parse(res.body); } catch (parseErr) { data = {}; }
    var headline = classificationHeadline_(data.classification);

    // Re-fetch and re-render the History card so the new row appears.
    var histRes = paidFetch_(
      '/api/invoices/' + encodeURIComponent(invoiceId) + '/history',
      { method: 'get' },
      'history-refresh'
    );
    if (histRes.statusCode >= 200 && histRes.statusCode < 300) {
      var histData = JSON.parse(histRes.body);
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildInvoiceHistoryCard_(histData)))
        .setNotification(
          CardService.newNotification().setText('Classified: ' + headline)
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Classified: ' + headline + '. Tap back to refresh.')
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Reconnect to classify.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Classify failed. Check your internet and try again.')
      )
      .build();
  }
}

function buildInvoiceHistoryCard_(data) {
  var inv = data.invoice || {};
  var reminders = data.reminders || [];
  var replies = data.replies || [];
  var schedules = data.schedules || [];
  var diag = data.diagnostics || {};

  // Header: client name is the title (their identity matters), money +
  // invoice number is the subtitle (the data). Version stamp tucked at the
  // end of the subtitle so Tommy can verify which add-on build is rendering
  // the card without having to navigate to home.
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader()
        .setTitle(inv.clientName || 'Client')
        .setSubtitle(
          fmtMoney_(inv.amount || 0) +
          (inv.quickbooksInvoiceId ? ' · Invoice ' + inv.quickbooksInvoiceId : '') +
          ' · v' + VERSION
        )
    );

  // Status section — single tight line. Amount is already in header so
  // don't repeat it; instead show "X days overdue · due Mon DD" as the
  // bottom label and the action ("Draft reminder") right under it. The
  // primary CTA moves up; was buried under all the log sections before.
  var statusSec = CardService.newCardSection();
  var daysOverdue = inv.daysOverdue || 0;
  var statusLine = daysOverdue > 0
    ? daysOverdue + ' days overdue'
    : 'On schedule';
  var dueLine = inv.dueDate ? 'due ' + formatShortDate_(inv.dueDate) : '';
  statusSec.addWidget(
    CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(severityDotUrl_(daysOverdue)))
      .setText(statusLine)
      .setBottomLabel(dueLine)
  );
  statusSec.addWidget(
    CardService.newButtonSet().addButton(
      CardService.newTextButton()
        .setText('Draft reminder')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('onDraftReminder')
            .setParameters({
              invoiceId: String(inv.id),
              clientEmail: String(inv.clientEmail || ''),
            })
        )
    )
  );
  card.addSection(statusSec);

  // Planned follow-up — render section ONLY when scheduled. The empty
  // case was a 3-line paragraph explaining a non-event; not rendering
  // anything is more honest design.
  if (schedules.length) {
    var schedSec = CardService.newCardSection().setHeader('Planned');
    schedules.forEach(function (s, i) {
      if (i > 0) schedSec.addWidget(CardService.newDivider());
      schedSec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(formatShortDate_(s.scheduled_for))
          .setText('Auto follow-up')
          .setBottomLabel(s.reason || '')
          .setWrapText(true)
      );
    });
    card.addSection(schedSec);
  }

  // Reminders sent — compact log. Show the most recent 5; collapse the
  // rest into a single "+N earlier" tap-to-expand line so a heavy log
  // (e.g., 14 sends during testing) doesn't dominate the card. Dropped
  // the bolded subject (auto-generated, identical across sends, read as
  // noise). Row label: tone if set, else "Sent" — the email icon already
  // says "this is an email event," so the label only needs to add context.
  if (reminders.length) {
    var remSec = CardService.newCardSection().setHeader(
      reminders.length === 1 ? '1 reminder sent' : reminders.length + ' reminders sent'
    );
    var MAX_ROWS = 5;
    var visible = reminders.slice(0, MAX_ROWS);
    visible.forEach(function (r, i) {
      if (i > 0) remSec.addWidget(CardService.newDivider());
      var label;
      if (r.tone) {
        label = capitalize_(r.tone);
      } else {
        label = 'Sent';
      }
      if (r.pay_link_included) label = label + ' · Pay Now';
      remSec.addWidget(
        CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
          .setText(label)
          .setBottomLabel(formatTimestamp_(r.created_at))
      );
    });
    if (reminders.length > MAX_ROWS) {
      var hidden = reminders.length - MAX_ROWS;
      // "+N earlier" is now a tappable TextButton (TEXT style) — pushes
      // a card showing the full log. Was a flat TextParagraph that read
      // like a non-actionable footer caption.
      remSec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('+' + hidden + ' earlier')
            .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onShowFullReminderLog')
                .setParameters({ invoiceId: String(inv.id) })
            )
        )
      );
    }
    card.addSection(remSec);
  }

  // Client responses — ALWAYS render the section, even when empty. Tommy's
  // feedback: hiding it entirely felt like the system wasn't checking for
  // replies. Empty state explains how a row appears here (so the user
  // doesn't think the feature is missing or broken).
  var repSec = CardService.newCardSection().setHeader(
    replies.length === 0
      ? 'Client responses'
      : (replies.length === 1 ? '1 client response' : replies.length + ' client responses')
  );
  if (replies.length === 0) {
    // Diagnostic-aware empty state. The naive "we haven't seen a reply"
    // copy was masking a real bug for Tommy: replies were coming in but
    // never getting classified, and there was no signal in the UI to
    // distinguish "no reply received" from "reply received but classify
    // never fired". Now we tell the user exactly which is true.
    var total = Number(diag.totalReplyClassifications) || 0;
    var forEmail = Number(diag.classificationsForClientEmail) || 0;
    var emailUsed = String(diag.clientEmailUsedForLookup || '');
    var samples = (diag.samplesForClientEmail || []);

    var primaryText;
    var helpText;
    if (reminders.length === 0) {
      // Pre-reminder state — no nudge yet.
      primaryText = 'No responses yet';
      helpText = 'Send a reminder first; Paid classifies the reply when it arrives.';
    } else if (total === 0) {
      // Zero classifications ANYWHERE for this user → auto-classify never
      // fired, full stop. The user has to open the actual reply thread in
      // Gmail (not just this History card) so the contextual handler runs.
      primaryText = 'No replies classified yet';
      helpText =
        'Open the client\'s reply email in Gmail. The Paid sidebar auto-processes it on open. Then come back here.';
    } else if (forEmail === 0) {
      // Classifications exist for other clients but none for this one.
      // Almost always an email-mismatch problem — the From: address on the
      // reply doesn't match client_email on the invoice.
      primaryText = 'No replies match this client';
      helpText =
        total + ' replies classified for other clients. None match ' +
        (emailUsed || 'this invoice') +
        '. Check the reply\'s From: address matches the invoice\'s client email.';
    } else {
      // Found classifications by email but they didn't link to this invoice
      // — usually they got routed to a different invoice for the same client.
      // Show where they landed so the user can see what happened.
      var otherInvoiceIds = [];
      for (var si = 0; si < samples.length; si++) {
        var sid = samples[si] && samples[si].invoice_id;
        if (sid && sid !== inv.id) otherInvoiceIds.push(sid);
      }
      primaryText = forEmail + ' replies for this client, none on this invoice';
      helpText =
        otherInvoiceIds.length
          ? 'Routed to other invoice(s) for the same client. Open the other invoice\'s History to see them.'
          : 'Replies exist for this client but didn\'t link here. Re-classify from the reply thread to repair.';
    }

    repSec.addWidget(
      CardService.newDecoratedText()
        .setText(primaryText)
        .setBottomLabel(helpText)
        .setWrapText(true)
    );
    // Manual escape hatch: the contextual auto-classify path has proven
    // unreliable (Tommy hit zero rows in DB despite multiple replies). This
    // button reads e.gmail.messageId from the action event (Gmail injects it
    // into ALL add-on handlers when a message is open in the reading pane,
    // not just contextual triggers), fetches the message text, and pushes
    // it through /api/replies/classify directly. Bypasses every silent-fail
    // path in the contextual handler.
    if (reminders.length > 0) {
      repSec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Classify the open reply')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onManualClassifyFromHistory')
                .setParameters({
                  invoiceId: String(inv.id || ''),
                  clientEmail: String(inv.clientEmail || ''),
                })
            )
        )
      );
    }
  } else {
    replies.forEach(function (rep, i) {
      if (i > 0) repSec.addWidget(CardService.newDivider());
      var bottom = '';
      if (rep.classification === 'will_pay_later' && rep.promised_pay_date) {
        bottom = 'Promised ' + formatShortDate_(rep.promised_pay_date);
      } else if (rep.suggested_action) {
        bottom = rep.suggested_action;
      }
      repSec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(formatTimestamp_(rep.created_at))
          .setText(classificationHeadline_(rep.classification))
          .setBottomLabel(bottom)
          .setWrapText(true)
      );
    });
  }
  card.addSection(repSec);

  return card.build();
}

/**
 * Action: expanded reminder log for a single invoice. Pushes a card that
 * lists every reminder sent (no 5-row cap) so the merchant can audit the
 * full timeline. Wired from the "+N earlier" link on the per-invoice
 * History card.
 */
function onShowFullReminderLog(e) {
  var p = (e && e.parameters) || {};
  var id = p.invoiceId;
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }
  try {
    var res = paidFetch_('/api/invoices/' + encodeURIComponent(id) + '/history', { method: 'get' });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().pushCard(buildFullReminderLogCard_(data))
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Enter your API key below to reconnect.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not load reminders. Try again.'))
      .build();
  }
}

function buildFullReminderLogCard_(data) {
  var inv = data.invoice || {};
  var reminders = data.reminders || [];
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader()
        .setTitle(inv.clientName || 'Client')
        .setSubtitle(
          (reminders.length === 1 ? '1 reminder sent' : reminders.length + ' reminders sent')
        )
    );
  if (!reminders.length) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText('No reminders sent yet.')
      )
    );
    return card.build();
  }
  var sec = CardService.newCardSection();
  reminders.forEach(function (r, i) {
    if (i > 0) sec.addWidget(CardService.newDivider());
    var label;
    if (r.tone) {
      label = capitalize_(r.tone);
    } else {
      label = 'Sent';
    }
    if (r.pay_link_included) label = label + ' · Pay Now';
    sec.addWidget(
      CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
        .setText(label)
        .setBottomLabel(formatTimestamp_(r.created_at))
    );
  });
  card.addSection(sec);
  return card.build();
}

/**
 * Action: open Stripe Connect onboarding so the merchant can set up payments
 * without leaving Gmail.
 *
 * Why we push a card instead of returning setOpenLink directly:
 *   - ActionResponseBuilder.setOpenLink is unreliable in Gmail Mobile add-ons
 *     — the link silently never opens. The user clicks Connect Stripe and
 *     sees nothing happen, which is exactly the "doesn't work" report.
 *   - TextButton.setOpenLink (a *direct* link on the button widget) works in
 *     both desktop and mobile because Gmail renders it as a native link.
 *
 * So: fetch the onboarding URL here, then push a card whose button has
 * setOpenLink baked in. One extra tap, but it actually opens.
 */
function onStartStripeConnect(e) {
  try {
    var res = paidFetch_('/api/stripe/connect/status', { method: 'get' });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    if (data.connected) {
      // Already done — pop the user back to home; the Pay Now badge will now
      // render in subsequent draft previews.
      clearHomePackCache_();
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText('Stripe is already connected. Pay Now buttons will appear in new drafts.')
        )
        .setNavigation(CardService.newNavigation().updateCard(buildHomePage_({})))
        .build();
    }
    if (data.onboardingUrl) {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().pushCard(
            buildStripeConnectCard_(data.onboardingUrl)
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Stripe Connect is not configured on the server.')
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Enter your API key below to reconnect.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not start Stripe setup. Try again.'))
      .build();
  }
}

/**
 * Intermediate card with a button whose setOpenLink is direct on the widget
 * (works on mobile, unlike ActionResponse.setOpenLink). OnClose.RELOAD busts
 * the home-pack cache and refreshes the sidebar when the user returns to
 * Gmail, so the "Stripe connected" state shows immediately.
 */
function buildStripeConnectCard_(onboardingUrl) {
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Connect Stripe')
        .setSubtitle('One-time setup, ~3 minutes')
    );
  var sec = CardService.newCardSection();
  sec.addWidget(
    CardService.newTextParagraph().setText(
      'Stripe handles card + ACH for your invoices. After setup, every reminder includes a one-click Pay Now button.'
    )
  );
  sec.addWidget(
    CardService.newButtonSet().addButton(
      CardService.newTextButton()
        .setText('Open Stripe setup')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOpenLink(
          CardService.newOpenLink()
            .setUrl(onboardingUrl)
            .setOpenAs(CardService.OpenAs.FULL_SIZE)
            .setOnClose(CardService.OnClose.RELOAD_ADD_ON)
        )
    )
  );
  sec.addWidget(
    CardService.newTextParagraph().setText(
      'When you finish, Gmail will refresh the sidebar automatically.'
    )
  );
  card.addSection(sec);
  card.addCardAction(
    CardService.newCardAction()
      .setText('Back')
      .setOnClickAction(CardService.newAction().setFunctionName('onBackHome'))
  );
  return card.build();
}

/**
 * Step 2 - send the cached draft via backend (Gmail on server).
 * Params: invoiceId (subject/body read from cache).
 */
function onSendReminder(e) {
  var id = e.parameters && e.parameters.invoiceId;
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }

  var draft = loadReminderDraft_(id);
  if (!draft || !draft.subject || !draft.body) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Draft expired. Generate the draft again.')
      )
      .build();
  }

  try {
    var res = paidFetch_('/api/invoices/send-reminder', {
      method: 'post',
      payload: JSON.stringify({
        invoiceId: id,
        subject: draft.subject,
        body: draft.body,
        channel: 'addon',
      }),
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      var data = {};
      try { data = JSON.parse(res.body) || {}; } catch (parseErr) { data = {}; }
      clearReminderDraft_(id);
      var composeUrl = data.composeUrl;
      if (composeUrl) {
        // Paid never calls gmail.send. Open Gmail compose prefilled and let
        // the merchant click Send themselves.
        return CardService.newActionResponseBuilder()
          .setOpenLink(
            CardService.newOpenLink()
              .setUrl(composeUrl)
              .setOpenAs(CardService.OpenAs.OVERLAY)
          )
          .setNotification(
            CardService.newNotification().setText(
              data.bodyTruncated
                ? 'Opened in Gmail. Body was long — verify in Drafts.'
                : 'Opened in Gmail. Click Send there.'
            )
          )
          .setNavigation(CardService.newNavigation().popCard())
          .build();
      }
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('Approved. Open Gmail to send.'))
        .setNavigation(CardService.newNavigation().popCard())
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_(
              'Your connection expired. Enter your API key below to reconnect.'
            )
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().updateCard(
          buildNotifyCard_(
            'Could not connect to Paid. Try again.',
            'onRefreshHome'
          )
        )
      )
      .build();
  }
}

/** Generate drafts for all 30+ day overdue; returns review queue card. */
function onQueueAllReminders(e) {
  try {
    var res = paidFetch_('/api/invoices/queue-bulk-drafts', { method: 'post', payload: '{}' });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    var queue = data.queue || [];
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildReviewQueueCard_(queue)))
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_(
              'Your connection expired. Enter your API key below to reconnect.'
            )
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().updateCard(
          buildNotifyCard_(
            'Could not connect to Paid. Try again.',
            'onRefreshHome'
          )
        )
      )
      .build();
  }
}

function reminderDraftKey_(invoiceId) {
  return 'paid_reminder_draft_' + String(invoiceId);
}

function cacheReminderDraft_(invoiceId, clientEmail, subject, body, tone, payNowIncluded, allTones) {
  PropertiesService.getUserProperties().setProperty(
    reminderDraftKey_(invoiceId),
    JSON.stringify({
      clientEmail: clientEmail || '',
      subject: subject || '',
      body: body || '',
      tone: tone || 'professional',
      payNowIncluded: !!payNowIncluded,
      // allTones (optional) is a {friendly:{subject,body,payNowIncluded}, professional:{...}, firm:{...}}
      // map. When present, onChangeTone swaps locally without an LLM round-trip.
      allTones: allTones || null,
    })
  );
}

function loadReminderDraft_(invoiceId) {
  var raw = PropertiesService.getUserProperties().getProperty(reminderDraftKey_(invoiceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function clearReminderDraft_(invoiceId) {
  PropertiesService.getUserProperties().deleteProperty(reminderDraftKey_(invoiceId));
}

function truncateForCard_(s, maxLen) {
  if (!s || s.length <= maxLen) return s || '';
  return s.substring(0, maxLen) + '\n...';
}

/**
 * Native Gmail compose (standalone draft) - uses scope gmail.addons.current.action.compose.
 * Data comes from the cached reminder draft for this invoice.
 */
function onOpenPaidCompose(e) {
  try {
    if (e.gmail && e.gmail.accessToken) {
      GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    }
    var id = e.parameters && e.parameters.invoiceId;
    var cached = id ? loadReminderDraft_(id) : null;
    var to = (cached && cached.clientEmail) || '';
    var subj = (cached && cached.subject) || '';
    var body = (cached && cached.body) || '';
    if (!cached) {
      subj = 'Paid - draft unavailable';
      body = 'Please return to Paid and generate the draft again.';
    }
    var gmailDraft = GmailApp.createDraft(to, subj, body);

    // Queue the "log this send" call to PropertiesService so the next
    // contextual/home render flushes it server-side. Doing the POST
    // SYNCHRONOUSLY here was blocking Gmail compose from opening by
    // ~500ms-2s — perceptible latency on every Edit-in-Gmail click. The
    // tracking accuracy trade-off is negligible: the queued send is
    // flushed within seconds when the user navigates back to the add-on.
    if (id && cached) {
      try {
        queuePendingSend_({
          invoiceId: id,
          subject: subj,
          body: body,
          channel: 'addon',
          tone: cached.tone || null,
          payNowIncluded: !!cached.payNowIncluded,
        });
        clearReminderDraft_(id);
      } catch (queueErr) {
        // Non-fatal — worst case we lose tracking for this one send.
      }
    }

    return CardService.newComposeActionResponseBuilder().setGmailDraft(gmailDraft).build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          'Edit in Gmail is only available on desktop.'
        )
      )
      .build();
  }
}

/**
 * Fallback when compose action cannot be attached (rare). Shows same mobile-safe message.
 */
/**
 * Pending-send queue: lets onOpenPaidCompose return INSTANTLY without
 * blocking on /api/invoices/send-reminder. The POST is stored in
 * UserProperties and flushed on the next home or contextual render. Net
 * effect: Gmail compose opens in <50ms instead of waiting for a 500ms-2s
 * server round-trip, with no loss of tracking accuracy.
 */
var PROP_PENDING_SENDS = 'PAID_PENDING_SENDS';

function queuePendingSend_(payload) {
  var props = PropertiesService.getUserProperties();
  var raw = props.getProperty(PROP_PENDING_SENDS) || '[]';
  var queue;
  try { queue = JSON.parse(raw); } catch (e) { queue = []; }
  if (!Array.isArray(queue)) queue = [];
  queue.push(payload);
  // Cap at 20 to avoid PropertiesService size limits if a user pounds Edit
  // in Gmail without the add-on ever flushing.
  if (queue.length > 20) queue = queue.slice(-20);
  props.setProperty(PROP_PENDING_SENDS, JSON.stringify(queue));
}

function flushPendingSends_() {
  var props = PropertiesService.getUserProperties();
  var raw = props.getProperty(PROP_PENDING_SENDS) || '';
  if (!raw) return;
  var queue;
  try { queue = JSON.parse(raw); } catch (e) { queue = []; }
  if (!Array.isArray(queue) || !queue.length) {
    props.deleteProperty(PROP_PENDING_SENDS);
    return;
  }
  // Clear the queue BEFORE firing — if any send fails, we don't want to
  // retry forever and double-log on success. The merchant can re-send if
  // needed; the worst-case loss is one tracking entry.
  props.deleteProperty(PROP_PENDING_SENDS);
  for (var i = 0; i < queue.length; i++) {
    try {
      paidFetch_('/api/invoices/send-reminder', {
        method: 'post',
        payload: JSON.stringify(queue[i]),
      });
    } catch (postErr) {
      // Skip — non-fatal.
    }
  }
}

function onEditInGmailUnavailable(e) {
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        'Edit in Gmail is only available on desktop. Try again from a desktop browser.'
      )
    )
    .build();
}

function truncateDraftBodyMobile_(body) {
  if (!body) return '';
  if (body.length <= 600) return body;
  return body.substring(0, 600) + '... (truncated)';
}

function buildDraftPreviewCard_(invoiceId) {
  var draft = loadReminderDraft_(invoiceId);
  var subj = draft && draft.subject ? draft.subject : '';
  var body = draft && draft.body ? draft.body : '';
  var tone = (draft && draft.tone) || 'professional';
  var payNowIncluded = !!(draft && draft.payNowIncluded);
  var clientEmail = (draft && draft.clientEmail) || '';

  // Header: data, not labels. "Draft to client@firm.com" is more useful
  // than the previous "Draft / Your AI-drafted reminder" filler subtitle.
  // setDisplayStyle(REPLACE) on every contextual return path.
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Draft')
        .setSubtitle(clientEmail || subj || 'Reminder')
    );

  // Subject + body in one tight section. Subject gets its own line so it
  // reads like an email preview, not a label/value pair.
  var bodySec = CardService.newCardSection();
  if (subj) {
    bodySec.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Subject')
        .setText(subj)
        .setWrapText(true)
    );
  }
  bodySec.addWidget(
    CardService.newTextParagraph().setText(truncateDraftBodyMobile_(body))
  );
  card.addSection(bodySec);

  // Primary action — Edit in Gmail — surfaced immediately after the body
  // (was buried at the bottom of the card before). One FILLED button only;
  // the tone selector is a control, not an action.
  var primarySec = CardService.newCardSection();
  var btnRow = CardService.newButtonSet();
  try {
    btnRow.addButton(
      CardService.newTextButton()
        .setText('Edit in Gmail')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setComposeAction(
          CardService.newAction()
            .setFunctionName('onOpenPaidCompose')
            .setParameters({ invoiceId: String(invoiceId) }),
          CardService.ComposedEmailType.STANDALONE_DRAFT
        )
    );
  } catch (composeErr) {
    btnRow.addButton(
      CardService.newTextButton()
        .setText('Edit in Gmail')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(CardService.newAction().setFunctionName('onEditInGmailUnavailable'))
    );
  }
  primarySec.addWidget(btnRow);
  card.addSection(primarySec);

  // Tone selector. Header only, no marketing copy. Three buttons in a row,
  // active one FILLED. That's it.
  var toneSec = CardService.newCardSection().setHeader('Tone');
  var toneRow = CardService.newButtonSet();
  ['friendly', 'professional', 'firm'].forEach(function (t) {
    var btn = CardService.newTextButton()
      .setText(capitalize_(t))
      .setTextButtonStyle(
        t === tone
          ? CardService.TextButtonStyle.FILLED
          : CardService.TextButtonStyle.OUTLINED
      )
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('onChangeTone')
          .setParameters({ invoiceId: String(invoiceId), tone: t })
      );
    toneRow.addButton(btn);
  });
  toneSec.addWidget(toneRow);
  card.addSection(toneSec);

  // Pay Now status — small footnote at the bottom. If enabled, single
  // line confirmation. If disabled, single line + an OUTLINED secondary
  // button (Stripe Connect). Not the visual centerpiece anymore.
  var statusSec = CardService.newCardSection();
  if (payNowIncluded) {
    statusSec.addWidget(
      CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DOLLAR))
        .setText('Pay Now included')
        .setWrapText(true)
    );
  } else {
    statusSec.addWidget(
      CardService.newDecoratedText()
        .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.DOLLAR))
        .setText('No Pay Now button')
        .setBottomLabel('Connect Stripe to enable one-click payment.')
        .setWrapText(true)
    );
    statusSec.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Connect Stripe')
          .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          .setOnClickAction(
            CardService.newAction().setFunctionName('onStartStripeConnect')
          )
      )
    );
  }
  card.addSection(statusSec);

  return card.build();
}

function formatHeaderLine_(header) {
  if (!header) return '';
  // Compact (rounded, no cents) at the header \u2014 "$24,182 outstanding"
  // reads cleaner than "$24,181.52 outstanding" for an at-a-glance
  // dashboard headline. Exact cents still appear on line items and the
  // History card where precision matters.
  var total = fmtMoneyCompact_(header.totalOutstanding);
  var clients = header.overdueClientCount || 0;
  if (!clients) return total + ' outstanding';
  return total + ' outstanding \u00b7 ' + clients + (clients === 1 ? ' client' : ' clients');
}

function formatDueDate_(iso) {
  if (!iso) return '';
  try {
    var s = String(iso);
    var d = new Date(s.length <= 10 ? s + 'T12:00:00' : s);
    return 'Due ' + Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM d, yyyy');
  } catch (err) {
    return '';
  }
}

function severityDotUrl_(days) {
  var d = Number(days) || 0;
  if (d >= 90) return DOT_90;
  if (d >= 60) return DOT_60;
  if (d >= 30) return DOT_30;
  return DOT_OK;
}

function buildCohortRow_(dotUrl, label, cohort) {
  var c = cohort || { total: 0, count: 0 };
  var cnt = n_(c.count);
  // Inverted hierarchy: the dollar amount is the hero (large text), the age
  // bucket is the context label (small top label), invoice count is the
  // caption (small bottom label). Before this, the AGE was hero and the
  // amount was hidden in a bottom subtitle \u2014 backwards from what the user
  // is scanning for.
  return CardService.newDecoratedText()
    .setStartIcon(CardService.newIconImage().setIconUrl(dotUrl))
    .setTopLabel(label)
    .setText(fmtMoneyCompact_(c.total))
    .setBottomLabel(cnt === 0 ? 'no invoices' : (cnt === 1 ? '1 invoice' : cnt + ' invoices'));
}

function appendInvoiceBlock_(section, row, withDivider) {
  if (withDivider) {
    section.addWidget(CardService.newDivider());
  }
  var dotUrl = severityDotUrl_(row.days_overdue);
  var d = Number(row.days_overdue) || 0;
  // One single, scannable bottom line. Dropped " - urgent" suffix (the dot
  // color carries severity), dropped "Due {date}" (redundant with days
  // overdue), dropped "Last reminder" extra row (it bloated the layout and
  // wasn't actionable info at this view \u2014 surfaces in the per-invoice
  // History card when needed).
  var bottomLine = (d > 0 ? d + ' days overdue' : 'current');
  // Make the invoice row itself tappable → opens History. This replaces
  // the secondary OUTLINED "History" button that doubled the visual
  // weight of every row. Now: one tap on the row body for History, one
  // FILLED primary button for the actual action (Draft reminder).
  section.addWidget(
    CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(dotUrl))
      .setTopLabel(row.client_name || 'Client')
      .setText(fmtMoney_(row.amount))
      .setBottomLabel(bottomLine)
      .setWrapText(true)
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('onShowInvoiceHistory')
          .setParameters({ invoiceId: String(row.id) })
      )
  );

  // Two buttons per row, with intentional visual weight difference:
  //   "Draft reminder" — FILLED, the primary action
  //   "History" — TEXT (link-style), discoverable but visually quiet so
  //               it doesn't compete with the primary button
  // The row body is ALSO tappable for History (set above) — power users
  // can tap anywhere, less-confident users see the explicit button.
  section.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText('Draft reminder')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('onDraftReminder')
              .setParameters({
                invoiceId: String(row.id),
                clientEmail: String(row.client_email || ''),
              })
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText('History')
          .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('onShowInvoiceHistory')
              .setParameters({ invoiceId: String(row.id) })
          )
      )
  );
}

// --- UI builders ---

/**
 * Single GET to /api/gmail/home-pack — invoices + cohorts + activity in one round-trip.
 * Falls back to /api/invoices/gmail-sidebar (older deploys) so the add-on keeps working
 * even if the backend is mid-deploy and home-pack is not yet live.
 *
 * Result is cached in user properties for HOME_PACK_TTL_MS so that repeat opens
 * of the sidebar render instantly. The Refresh button bypasses the cache.
 */
var HOME_PACK_CACHE_KEY = 'paid_home_pack_cache';
// 5 min — invoices change once per day (QB sync) so freshness within 5 min
// is fine, and this kills the cache-miss hit on virtually every click during
// a normal usage burst. Refresh button still busts the cache for an
// on-demand re-fetch.
var HOME_PACK_TTL_MS = 5 * 60 * 1000;
var HOME_PACK_TTL_S = Math.floor(HOME_PACK_TTL_MS / 1000);

/**
 * Memcached wrapper around /api/contacts/activity?email=X. Returns the
 * same shape as paidFetch_ (statusCode + body). 5-min TTL means a user
 * opening the same client thread repeatedly within a session renders
 * near-instant after the first fetch. Bust by clearing the cache key on
 * Refresh or after mutations (mark-paid, send-reminder, classify).
 */
var CONTACT_ACTIVITY_TTL_S = 300;
function contactActivityCacheKey_(email) {
  return 'paid_contact_act_' + String(email || '').toLowerCase();
}

function fetchContactActivityCached_(email) {
  var key = contactActivityCacheKey_(email);
  try {
    var hit = CacheService.getUserCache().get(key);
    if (hit) {
      var parsed = JSON.parse(hit);
      if (parsed && typeof parsed.statusCode === 'number') {
        return parsed;
      }
    }
  } catch (cacheErr) {
    // Fall through to network.
  }
  var res = paidFetch_(
    '/api/contacts/activity?email=' + encodeURIComponent(email),
    { method: 'get' },
    'contacts-activity'
  );
  if (res.statusCode === 200) {
    try {
      CacheService.getUserCache().put(
        key,
        JSON.stringify({ statusCode: res.statusCode, body: res.body }),
        CONTACT_ACTIVITY_TTL_S
      );
    } catch (writeErr) {
      // Cache put can fail if payload >100KB; skip silently.
    }
  }
  return res;
}

function clearContactActivityCache_(email) {
  try {
    CacheService.getUserCache().remove(contactActivityCacheKey_(email));
  } catch (err) { /* ignore */ }
}

function fetchGmailSidebarPack_(forceRefresh) {
  if (!forceRefresh) {
    var cached = readHomePackCache_();
    if (cached) return { ok: true, data: cached, cached: true };
  }

  var primary = paidFetch_('/api/gmail/home-pack', { method: 'get' }, 'home-pack');
  if (primary.statusCode === 200) {
    var data = JSON.parse(primary.body);
    writeHomePackCache_(data);
    return { ok: true, data: data, cached: false };
  }
  if (primary.statusCode === 404) {
    // Older deploy without home-pack — fall back to gmail-sidebar (no activity).
    var sidebar = paidFetch_('/api/invoices/gmail-sidebar', { method: 'get' }, 'gmail-sidebar');
    if (sidebar.statusCode === 200) {
      var sd = JSON.parse(sidebar.body);
      sd.activity = [];
      writeHomePackCache_(sd);
      return { ok: true, data: sd, cached: false };
    }
    return { ok: false, statusCode: sidebar.statusCode, body: sidebar.body };
  }
  return { ok: false, statusCode: primary.statusCode, body: primary.body };
}

/**
 * Two-layer cache for the home-pack response:
 * - CacheService (memcached-backed, ~5ms reads) — fast path
 * - PropertiesService (DB-backed, ~50-100ms reads) — survives memcached eviction
 *
 * Most clicks during a usage burst hit the memcache and render near-instantly.
 * The persistent layer is the safety net for the first click after memcache
 * eviction (Apps Script may evict at any time, but in practice memcache lasts
 * 6h+ for active users).
 */
function readHomePackCache_() {
  try {
    var memRaw = CacheService.getUserCache().get(HOME_PACK_CACHE_KEY);
    if (memRaw) {
      var memEntry = JSON.parse(memRaw);
      if (memEntry && memEntry.savedAt && memEntry.data &&
          Date.now() - memEntry.savedAt <= HOME_PACK_TTL_MS) {
        return memEntry.data;
      }
    }
  } catch (memErr) {
    // CacheService transient errors — fall through to PropertiesService.
  }
  try {
    var raw = PropertiesService.getUserProperties().getProperty(HOME_PACK_CACHE_KEY);
    if (!raw) return null;
    var entry = JSON.parse(raw);
    if (!entry || !entry.savedAt || !entry.data) return null;
    if (Date.now() - entry.savedAt > HOME_PACK_TTL_MS) return null;
    // Repopulate the memcache on a fresh-from-Properties read so the next
    // click within TTL is sub-10ms.
    try {
      CacheService.getUserCache().put(HOME_PACK_CACHE_KEY, raw, HOME_PACK_TTL_S);
    } catch (refillErr) { /* ignore */ }
    return entry.data;
  } catch (err) {
    return null;
  }
}

function writeHomePackCache_(data) {
  var payload = JSON.stringify({ savedAt: Date.now(), data: data });
  try {
    // Memcache first — fast and what subsequent reads will hit.
    CacheService.getUserCache().put(HOME_PACK_CACHE_KEY, payload, HOME_PACK_TTL_S);
  } catch (memErr) {
    // CacheService has a 100KB per-entry limit; if home-pack is somehow
    // larger we skip the memcache and rely on PropertiesService.
  }
  try {
    PropertiesService.getUserProperties().setProperty(HOME_PACK_CACHE_KEY, payload);
  } catch (err) {
    // Properties has size limits; on overflow just skip the cache.
  }
}

function clearHomePackCache_() {
  try {
    CacheService.getUserCache().remove(HOME_PACK_CACHE_KEY);
  } catch (memErr) { /* ignore */ }
  try {
    PropertiesService.getUserProperties().deleteProperty(HOME_PACK_CACHE_KEY);
  } catch (err) {
    // ignore
  }
}

function buildHomePage_(e) {
  // setDisplayStyle(REPLACE) — the home card is now also used as the
  // contextual fallback when there's no useful per-thread content. On
  // mobile, contextual cards default to PEEK chrome (Cancel/View buttons
  // at the bottom). REPLACE suppresses that. Ignored for true homepage
  // trigger renders, so safe to always set.
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE);

  if (!getApiKey_()) {
    // Try identity-based auth first — for users who already signed up at
    // paid-app.com with the same Google account, this Just Works with no
    // paste step. Falls through to the connect card on failure.
    tryIdentityExchange_();
  }

  if (!getApiKey_() || !getApiBase_()) {
    return card
      .setHeader(CardService.newCardHeader().setTitle('Paid').setSubtitle('Connect to continue'))
      .addSection(buildSettingsSection_())
      .build();
  }

  // Flush any queued send-logs from the last "Edit in Gmail" click. Doing
  // it here keeps the compose handler itself instant.
  flushPendingSends_();

  try {
    // No upfront /api/health round-trip — if home-pack fails, the user sees the same
    // diagnostic card and has the same "Refresh" affordance. Saves one network call
    // per open.
    maybeProactiveRefresh_();

    var forceRefresh = !!(e && e.parameters && e.parameters.forceRefresh);
    var pack = fetchGmailSidebarPack_(forceRefresh);
    if (!pack.ok) {
      return buildDiagnosticCard_(
        'home-pack',
        classifyErrorKind_(pack.statusCode, pack.body),
        userFacingApiError_(pack.statusCode, pack.body),
        'onRefreshHome'
      );
    }

    var data = pack.data;
    var cohorts = data.cohorts || {};
    var header = data.header || {};
    var invoices = data.invoices || [];

    // Header: outstanding $ as the hero number. Version kept on the
    // subtitle so you can verify which build is live after a clasp deploy
    // (this is the only reliable in-app version surface).
    card.setHeader(
      CardService.newCardHeader()
        .setTitle('Paid')
        .setSubtitle(formatHeaderLine_(header) + ' · v' + VERSION)
    );

    var overdue = invoices.filter(function (r) {
      return (r.days_overdue || 0) >= 30;
    });

    // Cohorts — the only summary section the user needs at-a-glance.
    // Section header dropped (the cohort labels speak for themselves) so
    // the four rows read as a clean stack instead of "section title +
    // bullet rows + bottom margin".
    var cohortSec = CardService.newCardSection();
    cohortSec.addWidget(buildCohortRow_(DOT_90, '90+ days', cohorts.d90));
    cohortSec.addWidget(buildCohortRow_(DOT_60, '60–90 days', cohorts.d60));
    cohortSec.addWidget(buildCohortRow_(DOT_30, '30–60 days', cohorts.d30));
    cohortSec.addWidget(buildCohortRow_(DOT_OK, 'Current', cohorts.current));
    card.addSection(cohortSec);

    // Activity — actionable client replies that need a response. Only
    // shown if there's something. We dropped the standalone "Recent
    // reminders" section because the merchant just sent them; rendering
    // them in the sidebar a second time was noise.
    var activitySec = buildActivitySectionFromPack_(data.activity);
    if (activitySec) card.addSection(activitySec);

    // Overdue invoices — the action queue. Header is dropped when there's
    // nothing overdue (clean empty state).
    var listSec = CardService.newCardSection();
    if (!overdue.length) {
      // Single-line empty state. No "you are caught up" reward copy.
      listSec.addWidget(
        CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIconUrl(DOT_OK))
          .setText('Nothing overdue')
      );
    } else {
      listSec.setHeader(overdue.length === 1 ? '1 overdue' : overdue.length + ' overdue');
      overdue.slice(0, 25).forEach(function (row, idx) {
        appendInvoiceBlock_(listSec, row, idx > 0);
      });
      if (overdue.length > 25) {
        listSec.addWidget(
          CardService.newTextParagraph().setText(
            '+' + (overdue.length - 25) + ' more on paid-app.com'
          )
        );
      }
    }
    card.addSection(listSec);

    // Footer: Sync is the only primary action. "Review all reminders" was
    // dropped — it surfaced a one-by-one approval queue most users never
    // engaged with (per-invoice "Draft reminder" buttons cover the same job
    // in context), and it competed visually with the per-row primary CTA.
    var foot = CardService.newCardSection();
    foot.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Sync from QuickBooks')
          .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
          .setOnClickAction(CardService.newAction().setFunctionName('onSyncQuickBooks'))
      )
    );
    card.addSection(foot);

    card.addCardAction(
      CardService.newCardAction()
        .setText('Refresh')
        .setOnClickAction(CardService.newAction().setFunctionName('onRefreshHome'))
    );
    card.addCardAction(
      CardService.newCardAction()
        .setText('Sync from QuickBooks')
        .setOnClickAction(CardService.newAction().setFunctionName('onSyncQuickBooks'))
    );

    return card.build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return buildReconnectCard_(
        'Your connection expired. Enter your API key below to reconnect.'
      );
    }
    return buildDiagnosticCard_(
      'home',
      'network',
      'Home load failed due to a network error.',
      'onRefreshHome'
    );
  }
}

function onRefreshHome(e) {
  // Bust the home-pack cache so the user gets fresh data after pressing Refresh.
  clearHomePackCache_();
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

/**
 * Trigger a QuickBooks invoice sync from inside Gmail — same endpoint the
 * web dashboard hits. Pulls overdue invoices into Paid so the user doesn't
 * have to leave Gmail to refresh their A/R. We bust the home-pack cache
 * after a successful sync and re-render so the new invoices show up
 * immediately.
 *
 * Failure modes that surface as notifications instead of breaking the card:
 *   - QuickBooks not connected → user-facing message + nudge to Settings.
 *   - Token expired → user-facing reconnect prompt.
 *   - Transient API error → "Try again" with the underlying status.
 */
function onSyncQuickBooks(e) {
  try {
    var res = paidFetch_(
      '/api/invoices/sync',
      { method: 'post', payload: '{}', contentType: 'application/json' },
      'qb-sync'
    );
    if (res.statusCode >= 200 && res.statusCode < 300) {
      var data = {};
      try { data = JSON.parse(res.body); } catch (parseErr) { /* ignore */ }
      var upserted = Number(data && data.upserted) || 0;
      var overdueCount = Number(data && data.overdueCount) || 0;
      var msg;
      if (upserted === 0) {
        msg = 'QuickBooks is up to date — no new invoices.';
      } else {
        msg = 'Synced ' + upserted + (upserted === 1 ? ' invoice' : ' invoices') +
              ' from QuickBooks.' + (overdueCount > 0 ? ' ' + overdueCount + ' overdue.' : '');
      }
      // Bust the home-pack cache so the next render shows the fresh data.
      clearHomePackCache_();
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
        .setNotification(CardService.newNotification().setText(msg))
        .build();
    }
    // 400 — QuickBooks not connected. 401 — token invalid. Either way,
    // route the user to Settings rather than showing a cryptic notification.
    if (res.statusCode === 400 || res.statusCode === 401) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(
            res.statusCode === 401
              ? 'Reconnect QuickBooks at paid-app.com/settings.'
              : 'Connect QuickBooks at paid-app.com/settings before syncing.'
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          userFacingApiError_(res.statusCode, res.body)
        )
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Reconnect to sync.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Sync failed. Check your internet and try again.')
      )
      .build();
  }
}

/** Bottom nav: open minimal settings card */
function onOpenSettings(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_(e)))
    .build();
}

function onBackHome(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

function buildSettingsCard_(e) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Paid').setSubtitle('Connection - v' + VERSION))
    .addSection(buildSettingsSection_())
    .addCardAction(
      CardService.newCardAction()
        .setText('Back to invoices')
        .setOnClickAction(CardService.newAction().setFunctionName('onBackHome'))
    )
    .build();
}

function buildSettingsSection_() {
  var section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        '<b>Connect with your Google account</b><br>' +
          'If you already signed up at paid-app.com with this email, one tap connects you. No keys to copy.'
      )
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Connect with Google')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(CardService.newAction().setFunctionName('onIdentityConnect'))
      )
    )
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextParagraph().setText(
        '<b>Or paste a connection key</b><br>' +
          'Sign in at paid-app.com → Settings → "Generate and copy key", then paste below.'
      )
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Open settings page')
          .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          .setOpenLink(CardService.newOpenLink().setUrl('https://paid-app.com/settings'))
      )
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('api_base')
        .setTitle('API base URL (optional)')
        .setHint('https://paid-app.com')
    )
    .addWidget(
      CardService.newTextInput().setFieldName('api_key').setTitle('API key')
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Save')
          .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
          .setOnClickAction(CardService.newAction().setFunctionName('onSavePaidSettings'))
      )
    );
  return section;
}

/**
 * On-demand handler for "Connect with Google" — distinguishes signed-up
 * users (success → home card) from non-customers (NO_ACCOUNT → notify with
 * a sign-up nudge).
 */
function onIdentityConnect(e) {
  var r = exchangeIdentityDetailed_();
  if (r.ok) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
      .setNotification(CardService.newNotification().setText('Connected with Google.'))
      .build();
  }
  if (r.reason === 'no_account') {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          'No Paid account for this Google address. Sign up at paid-app.com first.'
        )
      )
      .build();
  }
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(
        'Could not connect with Google. Try the connection key below.'
      )
    )
    .build();
}

function onReconnectFromError(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_(e)))
    .build();
}

function buildContextualForMessage_(e) {
  if (!getApiKey_()) {
    tryIdentityExchange_();
  }
  if (!getApiKey_() || !getApiBase_()) {
    var c = CardService.newCardBuilder()
      .setDisplayStyle(CardService.DisplayStyle.REPLACE)
      .setHeader(CardService.newCardHeader().setTitle('Paid'));
    c.addSection(buildSettingsSection_());
    return c.build();
  }

  var access = e.gmail && e.gmail.accessToken;
  var messageId = e.gmail && e.gmail.messageId;
  if (!access || !messageId) {
    // No message in context yet — show the home dashboard instead of a
    // dead-end "open a message" notify card. The dashboard is always
    // actionable.
    return buildHomePage_({});
  }

  // ONE Gmail API call returns From + all participants + INBOX status.
  // Used to be two separate fetches (~600ms total cold-start) — now ~300ms.
  var meta = extractMessageMeta_(messageId, access);
  var fromEmail = meta.from;
  var isInbox = meta.isInbox;
  var ownEmail = getOwnEmailLower_();
  // Filter own email from participants — calling /api/contacts/activity
  // for self renders as "No invoices on record" which looks broken. We
  // want client contacts only on the contact card.
  var emails = meta.participants.filter(function (em) {
    return em && em !== ownEmail;
  });

  // Only fall back to the home dashboard for truly outbound views with
  // no other participants. If the message is in INBOX, even with empty
  // participants and From=own (self-reply), we DO want to render the
  // contextual card — it triggers the classify pipeline. The previous
  // gate killed the self-reply test flow before auto-classify could fire.
  if (!emails.length && !isInbox) {
    return buildHomePage_({});
  }

  return buildCardsForEmails_(emails, 'onRefreshContextualMessage', {
    messageId: String(messageId),
    fromEmail: fromEmail,
    accessToken: access,
    isInbox: isInbox,
  });
}

function buildContextualForCompose_(e) {
  if (!getApiKey_()) {
    tryIdentityExchange_();
  }
  if (!getApiKey_() || !getApiBase_()) {
    var c = CardService.newCardBuilder()
      .setDisplayStyle(CardService.DisplayStyle.REPLACE)
      .setHeader(CardService.newCardHeader().setTitle('Paid'));
    c.addSection(buildSettingsSection_());
    return c.build();
  }

  var emails = [];
  if (e.draftMetadata && e.draftMetadata.toRecipients) {
    e.draftMetadata.toRecipients.forEach(function (r) {
      var em = extractEmail_(r);
      if (em) emails.push(em);
    });
  } else if (e.gmail && e.gmail.draftMetadata && e.gmail.draftMetadata.toRecipients) {
    e.gmail.draftMetadata.toRecipients.forEach(function (r) {
      var em = extractEmail_(r);
      if (em) emails.push(em);
    });
  }

  emails = uniqueLower_(emails);
  if (!emails.length) {
    // No recipients in compose yet — show the home dashboard so the user
    // can see their full A/R while they type the To: field, instead of a
    // dead-end notify card.
    return buildHomePage_({});
  }

  return buildCardsForEmails_(emails, 'onRefreshContextualCompose');
}

function onRefreshContextualMessage(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().updateCard(buildContextualForMessage_(e))
    )
    .build();
}

function onRefreshContextualCompose(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation().updateCard(buildContextualForCompose_(e))
    )
    .build();
}

function buildCardsForEmails_(emails, contextualRefreshFn, replyContext) {
  try {
  // Detect whether the OPEN message is the merchant's own outbound (a
  // reminder they sent, currently being viewed). The check is: From is
  // own AND the message is NOT in INBOX. A self-reply (From own but
  // INBOX label set) is NOT outbound — it's a received reply.
  var ownAddrEarly = getOwnEmailLower_();
  var isOutbound =
    replyContext &&
    replyContext.fromEmail &&
    replyContext.fromEmail === ownAddrEarly &&
    replyContext.isInbox !== true;
  var headerSubtitle = isOutbound ? 'Sent' : 'Contact';

  // setDisplayStyle(REPLACE) is the ONLY way to suppress Gmail Mobile's
  // automatic PEEK chrome (the Cancel/View buttons at the bottom of the
  // overlay). Without it, every contextual return defaults to PEEK on
  // mobile. Verified against Apps Script CardBuilder docs.
  var builder = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader().setTitle('Paid').setSubtitle(headerSubtitle)
    );
  // Track whether we added any content. If we get to the end with zero
  // sections, we always render a useful fallback — the user should never
  // see a card with only a header (the blank "after send" state Tommy
  // reported was exactly this — emails resolved to something, classify
  // section skipped because shouldAutoClassify was false and no prior
  // existed, contact-activity fetch silently failed).
  var sectionsAdded = 0;

  // Auto-classify only when the OPEN message is INBOUND from a client.
  // Previously we classified any thread with a fromEmail, which meant Tommy's
  // own SENT reminders were getting classified as "replies" (nonsense LLM
  // output, no invoice_id linked, never surfaced anywhere useful). The fix:
  //   - fromEmail must be set
  //   - fromEmail must NOT be the merchant's own address
  //   - If From is somehow the merchant's own (e.g., re-opened a draft),
  //     fall back to the first non-self participant for the lookup so we
  //     still link the classification to the right client invoice.
  var ownAddr = getOwnEmailLower_();
  var clientEmailForClassify = '';
  if (replyContext && replyContext.fromEmail) {
    if (replyContext.fromEmail !== ownAddr) {
      clientEmailForClassify = replyContext.fromEmail;
    } else {
      for (var fi = 0; fi < emails.length; fi++) {
        if (emails[fi] && emails[fi] !== ownAddr) {
          clientEmailForClassify = emails[fi];
          break;
        }
      }
    }
  }
  // Self-test fallback: when no non-self participant exists (merchant
  // sent the reminder TO themselves to test the loop), use the merchant's
  // own email for the invoice lookup. The classify route looks up
  // invoices WHERE client_email = X; for self-test invoices, client_email
  // IS the merchant's address. Without this, the classification gets
  // saved with invoice_id=null and never appears on the per-invoice
  // History card (which filters by invoice_id).
  if (!clientEmailForClassify && replyContext && replyContext.isInbox && ownAddr) {
    clientEmailForClassify = ownAddr;
  }
  // New gate: classify any RECEIVED message (INBOX label present), even
  // when the From: address is the merchant's own. This handles the
  // self-reply test loop (Tommy replies to his own reminder from the same
  // Gmail account) AND the case where a client replies from an alias of
  // the merchant's domain. Outbound-only messages (SENT folder, no INBOX)
  // still skip — those are reminders the merchant sent, not replies.
  var shouldAutoClassify =
    replyContext &&
    replyContext.messageId &&
    replyContext.fromEmail &&
    (replyContext.isInbox === true || replyContext.fromEmail !== ownAddr);

  // Gate: render the classify section whenever there's a message at all,
  // even when no client email is identifiable (self-reply test where the
  // merchant emails themselves — emails array is empty after filtering
  // own — or single-participant edge cases). Without this, the entire
  // section was being skipped and the "Classify reply" button never
  // rendered on self-reply test threads.
  if (replyContext && replyContext.messageId) {
    var prior = fetchPriorClassificationsForThread_(replyContext.messageId);

    // Cache miss + actually-inbound message: kick off auto-classification once.
    if (
      shouldAutoClassify &&
      (!prior || prior.length === 0) &&
      replyContext.accessToken
    ) {
      try {
        var bodyText = fetchMessagePlainText_(replyContext.messageId, replyContext.accessToken);
        if (bodyText) {
          // Build classify payload — omit clientEmail when empty so the
          // server's Zod schema (which expects email-or-undefined) doesn't
          // reject the request. Server-side falls back to invoice_id=null
          // when no email is provided, which is correct behavior for the
          // self-reply test case.
          var classifyPayload = {
            threadId: replyContext.messageId,
            replyText: bodyText,
            auto: true,
          };
          if (clientEmailForClassify) {
            classifyPayload.clientEmail = clientEmailForClassify;
          }
          var autoRes = paidFetch_('/api/replies/classify', {
            method: 'post',
            payload: JSON.stringify(classifyPayload),
          });
          if (autoRes.statusCode >= 200 && autoRes.statusCode < 300) {
            var autoData = JSON.parse(autoRes.body);
            prior = [{
              classification: autoData.classification,
              promisedPayDate: autoData.promisedPayDate,
              suggestedAction: autoData.suggestedAction,
              invoiceId: autoData.invoiceId,
              createdAt: new Date().toISOString(),
              autoScheduledFor: autoData.scheduledFor,
            }];
            // Bust the prior-classify cache for this thread + the contact
            // activity cache for the (newly-linked) client so the next
            // render reflects the just-inserted row.
            clearPriorClassifyCache_(replyContext.messageId);
            if (clientEmailForClassify) {
              clearContactActivityCache_(clientEmailForClassify);
            }
          }
        }
      } catch (autoErr) {
        // ignore — fall through to manual Classify button
      }
    }
    var classifySec = CardService.newCardSection();

    if (prior && prior.length > 0) {
      var last = prior[0];
      // Bottom line is the contextual fact, not a list of metadata. If a
      // promised date exists, that's THE thing the merchant needs to see;
      // otherwise show the suggested next action. The old version
      // concatenated all three with " · " which read as engineering log
      // output, not a designed status line.
      var bottomLine = '';
      if (last.promisedPayDate) {
        bottomLine = 'Promised ' + formatShortDate_(last.promisedPayDate) +
          (last.autoScheduledFor ? ' · follow up ' + formatShortDate_(last.autoScheduledFor) : '');
      } else if (last.suggestedAction) {
        bottomLine = last.suggestedAction;
      } else if (last.autoScheduledFor) {
        bottomLine = 'Follow up ' + formatShortDate_(last.autoScheduledFor);
      }
      classifySec.addWidget(
        CardService.newDecoratedText()
          .setText(classificationHeadline_(last.classification))
          .setBottomLabel(bottomLine)
          .setWrapText(true)
      );
      // Primary CTA — "Draft response". Uses a compose action (in-page sub-
      // window, same UX as "Edit in Gmail") rather than the old OpenLink path
      // which spawned a new browser tab. Threaded as a reply when the open
      // message is known, so it lands inside the client's existing thread on
      // their side instead of starting a new conversation.
      var replyAction = CardService.newAction()
        .setFunctionName('onDraftResponse')
        .setParameters({
          classification: String(last.classification || ''),
          promisedPayDate: String(last.promisedPayDate || ''),
          clientEmail: String(clientEmailForClassify || ''),
          messageId: String(replyContext.messageId || ''),
        });
      var draftBtn = CardService.newTextButton()
        .setText('Draft response')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED);
      try {
        draftBtn.setComposeAction(replyAction, CardService.ComposedEmailType.REPLY_AS_DRAFT);
      } catch (composeErr) {
        // Older Apps Script runtimes — fall back to the legacy URL path.
        var draftReplyUrl = buildReplyDraftUrl_(last, clientEmailForClassify);
        draftBtn.setOpenLink(
          CardService.newOpenLink().setUrl(draftReplyUrl)
        );
      }
      classifySec.addWidget(CardService.newButtonSet().addButton(draftBtn));

      if (
        last.invoiceId &&
        (last.classification === 'cannot_pay' || last.classification === 'payment_plan_request')
      ) {
        classifySec.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText('Suggest payment plan')
              .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('onSuggestPaymentPlan')
                  .setParameters({ invoiceId: String(last.invoiceId) })
              )
          )
        );
      }
      // Re-classify removed — re-running the same LLM call on the same body
      // produces the same answer 95% of the time. If a merchant disagrees,
      // the right move is to ignore the classification and write their own
      // reply, which "Draft response" already supports. Hiding the
      // mechanism, not the action.
    } else if (isOutbound) {
      // True outbound view (sent, not in INBOX). Show a clean confirmation
      // strip — the merchant just sent a reminder, they want a "✓ done"
      // signal, not three lines of instructional copy. The classify-this-
      // thread manual override is now hidden under the 3-dot — most users
      // don't need it. Self-test flow uses the regular inbound path
      // because INBOX-label messages take the else branch below.
      classifySec.addWidget(
        CardService.newDecoratedText()
          .setStartIcon(CardService.newIconImage().setIconUrl(DOT_OK))
          .setText('Reminder sent')
          .setBottomLabel("We'll classify the client's reply when it arrives.")
          .setWrapText(true)
      );
    } else {
      // Pre-classify fallback — only shown when the auto-classify call
      // didn't return (transient server error, body fetch empty). Single
      // FILLED button, no intro paragraph; the button label says what it
      // does and the empty card is a stronger nudge than instructional
      // copy is.
      classifySec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Classify this reply')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onClassifyReply')
                .setParameters({
                  messageId: replyContext.messageId,
                  fromEmail: clientEmailForClassify || replyContext.fromEmail,
                })
            )
        )
      );
    }
    builder.addSection(classifySec);
    sectionsAdded++;
  }

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    try {
      // 5-min memcache on per-contact activity. Opening the same client
      // thread multiple times in a session now hits CacheService (~5ms)
      // instead of round-tripping to paid-app.com every render. Cache
      // invalidates on Refresh button (clears all keyed entries) and
      // naturally expires after 5 min if the user's been away.
      var res = fetchContactActivityCached_(email);
      if (res.statusCode !== 200) {
        builder.addSection(
          CardService.newCardSection().addWidget(
            CardService.newDecoratedText()
              .setText(email)
              .setBottomLabel(userFacingApiError_(res.statusCode, res.body))
          )
        );
        sectionsAdded++;
        continue;
      }
      var data = JSON.parse(res.body);
      var totals = data.totals || {};
      var invoicesAll = data.invoices || [];
      var reminders = data.reminders || [];
      var replies = data.replies || [];
      var clientName = data.clientName || email;

      if (!invoicesAll.length && !reminders.length) {
        builder.addSection(
          CardService.newCardSection().addWidget(
            CardService.newDecoratedText()
              .setText(email)
              .setBottomLabel('No invoices on record for this contact')
          )
        );
        sectionsAdded++;
        continue;
      }

      // Summary \u2014 one widget. Was four rows of stat labels (Outstanding /
      // Recovered / Reminders sent / replies classified) stacked like a
      // report header. Now: client identity is the hero, the financial
      // headline ($X outstanding \u00b7 N overdue) is the bottom label, and the
      // counters live further down the card where they're already shown
      // by the per-invoice and recent-reminders sections. No duplication.
      var summarySec = CardService.newCardSection();
      var headlineBits = [];
      if (totals.outstanding) headlineBits.push(fmtMoneyCompact_(totals.outstanding) + ' outstanding');
      if (totals.overdueCount) headlineBits.push(totals.overdueCount + ' overdue');
      summarySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(email)
          .setText(clientName)
          .setBottomLabel(headlineBits.length ? headlineBits.join(' \u00b7 ') : 'No outstanding invoices')
          .setWrapText(true)
      );
      builder.addSection(summarySec);
      sectionsAdded++;

      // Open invoices block (only if there are any)
      var openInvoices = invoicesAll.filter(function (r) {
        return r.status !== 'paid';
      });
      if (openInvoices.length) {
        var invSec = CardService.newCardSection().setHeader('Open invoices');
        openInvoices.slice(0, 6).forEach(function (row, idx) {
          appendInvoiceBlock_(invSec, row, idx > 0);
        });
        if (openInvoices.length > 6) {
          invSec.addWidget(
            CardService.newTextParagraph().setText(
              'Plus ' + (openInvoices.length - 6) + ' more.'
            )
          );
        }
        builder.addSection(invSec);
        sectionsAdded++;
      }

      // Recent reminders \u2014 last 3 (was 5), and stripped to just the
      // signal: time and tone. The reminder subject was a one-row title
      // long enough to wrap; in 90% of cases it's identical across sends.
      // The channel suffix ("via gmail-compose-addon") was an internal
      // string leaking into the user-facing card. Both dropped.
      if (reminders.length) {
        var remSec = CardService.newCardSection().setHeader(
          reminders.length === 1 ? '1 reminder sent' : reminders.length + ' reminders sent'
        );
        reminders.slice(0, 3).forEach(function (r, idx) {
          if (idx > 0) remSec.addWidget(CardService.newDivider());
          var label = r.tone ? capitalize_(r.tone) : 'Sent';
          if (r.pay_link_included) label += ' \u00b7 Pay Now';
          remSec.addWidget(
            CardService.newDecoratedText()
              .setStartIcon(CardService.newIconImage().setIcon(CardService.Icon.EMAIL))
              .setText(label)
              .setBottomLabel(formatTimestamp_(r.created_at))
          );
        });
        builder.addSection(remSec);
        sectionsAdded++;
      }

      // Recent replies — last 3. Tighter copy on the bottom line: a
      // promised date is the signal, otherwise the model's suggested
      // action. The ISO date moves from the body to the top label and
      // renders in the same relative-time format as the reminder rows
      // so the two logs read in the same scan.
      if (replies.length) {
        var repSec = CardService.newCardSection().setHeader(
          replies.length === 1 ? '1 reply' : replies.length + ' replies'
        );
        replies.slice(0, 3).forEach(function (rep, idx) {
          if (idx > 0) repSec.addWidget(CardService.newDivider());
          var bottom = '';
          if (rep.classification === 'will_pay_later' && rep.promised_pay_date) {
            bottom = 'Promised ' + formatShortDate_(rep.promised_pay_date);
          } else if (rep.suggested_action) {
            bottom = rep.suggested_action;
          }
          repSec.addWidget(
            CardService.newDecoratedText()
              .setTopLabel(formatTimestamp_(rep.created_at))
              .setText(classificationHeadline_(rep.classification))
              .setBottomLabel(bottom)
              .setWrapText(true)
          );
        });
        builder.addSection(repSec);
        sectionsAdded++;
      }
    } catch (err) {
      if (err && err.name === 'PaidAuthReconnectError') {
        return buildReconnectCard_(
          'Your connection expired. Enter your API key below to reconnect.'
        );
      }
      var errSec = CardService.newCardSection();
      errSec.addWidget(
        CardService.newTextParagraph().setText(
          'Could not load data for ' + email + '. Try again.'
        )
      );
      errSec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Refresh')
            .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
            .setOnClickAction(
              CardService.newAction().setFunctionName(
                contextualRefreshFn || 'onRefreshContextualMessage'
              )
            )
        )
      );
      builder.addSection(errSec);
      sectionsAdded++;
    }
  }

  // Safety net: a card with only a header is a UX dead-end. Always show
  // SOMETHING useful — either a "View dashboard" link (when we know who
  // the contact is but the API gave us nothing actionable) or a "tap to
  // open Paid" fallback. This is what fixes the "blank card after sending"
  // state Tommy reported.
  if (sectionsAdded === 0) {
    var fallbackSec = CardService.newCardSection();
    fallbackSec.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Paid')
        .setText(
          emails.length
            ? 'No matching data for ' + emails[0] + ' yet.'
            : 'Open a client email thread to see their A/R.'
        )
        .setBottomLabel(
          'Outbound messages and threads with no Paid invoice show nothing here by design — invoice activity lives on the main sidebar.'
        )
        .setWrapText(true)
    );
    fallbackSec.addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText('Open Paid')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(CardService.newAction().setFunctionName('onBackHome'))
        )
        .addButton(
          CardService.newTextButton()
            .setText('Refresh')
            .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
            .setOnClickAction(
              CardService.newAction().setFunctionName(
                contextualRefreshFn || 'onRefreshContextualMessage'
              )
            )
        )
    );
    builder.addSection(fallbackSec);
  }

  return builder.build();
  } catch (outerErr) {
    if (outerErr && outerErr.name === 'PaidAuthReconnectError') {
      return buildReconnectCard_(
        'Your connection expired. Enter your API key below to reconnect.'
      );
    }
    return buildNotifyCard_(
      'Could not load invoice data for this view. Try again.',
      contextualRefreshFn || 'onRefreshContextualMessage'
    );
  }
}

function sumAmount_(rows) {
  var t = 0;
  rows.forEach(function (r) {
    t += Number(r.amount) || 0;
  });
  return t;
}

function buildReviewQueueCard_(queue) {
  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('Queued drafts')
      .setSubtitle('Review and approve each reminder before sending')
  );
  if (!queue.length) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText('Nothing in queue.')
      )
    );
    return card.build();
  }

  queue.forEach(function (item, i) {
    cacheReminderDraft_(
      item.invoiceId,
      item.clientEmail,
      item.subject,
      item.body,
      item.tone,
      !!item.payNowIncluded
    );
    var sec = CardService.newCardSection();
    if (i > 0) {
      sec.addWidget(CardService.newDivider());
    }
    sec.addWidget(
      CardService.newDecoratedText()
        .setText(item.clientName || 'Client')
        .setBottomLabel(
          item.daysOverdue + ' days \u00b7 ' + fmtMoney_(item.amount)
        )
    );
    sec.addWidget(
      CardService.newTextParagraph().setText(
        item.body.length > 500 ? item.body.substring(0, 500) + '...' : item.body
      )
    );
    sec.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Preview')
          .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('onShowQueuedDraft')
              .setParameters({ invoiceId: String(item.invoiceId) })
          )
      )
    );
    card.addSection(sec);
  });

  return card.build();
}

function buildNotifyCard_(text, refreshFunctionName) {
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Paid')
        .setSubtitle('Tap Refresh to try again')
    )
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(text)
      )
    );
  var refreshFn = refreshFunctionName || 'onRefreshHome';
  card.addCardAction(
    CardService.newCardAction()
      .setText('Refresh')
      .setOnClickAction(CardService.newAction().setFunctionName(refreshFn))
  );
  return card.build();
}

// --- HTTP + helpers ---

/**
 * User-visible API failure copy — surfaces enough of the actual failure so
 * we (and the user) can tell the difference between an auth problem, a
 * server bug, and a network blip. The previous "Check your API key" copy
 * fired for every non-200 which masked real backend failures.
 */
function userFacingApiError_(statusCode, body) {
  var c = Number(statusCode) || 0;
  // Try to extract a useful detail/error message from the response body so
  // the user (and Tommy debugging) sees the actual cause instead of a
  // generic "server error". Server routes return JSON with `error` and
  // optional `detail` fields.
  var detail = '';
  try {
    if (body) {
      var parsed = JSON.parse(String(body));
      if (parsed && typeof parsed === 'object') {
        var msg = parsed.detail || parsed.error;
        if (msg) detail = ': ' + String(msg).slice(0, 200);
      }
    }
  } catch (parseErr) { /* not JSON — ignore */ }

  if (c === 401 || c === 403) {
    return 'Paid rejected the request (auth)' + detail + '. Reconnect from Settings.';
  }
  if (c === 404) {
    return 'Paid endpoint missing (404)' + detail + '. The server may be deploying — try again in a minute.';
  }
  if (c === 429) {
    return 'Paid is rate-limiting (429)' + detail + '. Try again in a few seconds.';
  }
  if (c === 502) {
    return 'Upstream service failed' + detail + '. (Anthropic/QuickBooks/Stripe likely; try again shortly.)';
  }
  if (c >= 500 && c < 600) {
    return 'Paid server error (' + c + ')' + detail + '.';
  }
  if (c === 0) {
    return 'Could not reach Paid (network). Check your connection and try again.';
  }
  return 'Paid request failed (HTTP ' + c + ')' + detail + '.';
}

function classifyErrorKind_(statusCode, body) {
  var c = Number(statusCode) || 0;
  if (c === 401 || c === 403) return 'auth';
  return 'network';
}

function paidFetch_(path, opts, stepName) {
  return paidFetchWithRecovery_(path, opts, false, stepName || path);
}

function paidFetchWithRecovery_(path, opts, didRetry, stepName) {
  var base = getApiBase_();
  var apiKey = getApiKey_();
  if (!base || !apiKey) throw new Error('Configure PAID_API_BASE and PAID_API_KEY');

  var url = base + path;
  /** UrlFetchApp timeout is total request duration (ms); no separate connectTimeout in Apps Script. */
  var params = {
    method: opts.method || 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
    timeout: 10000,
  };
  if (opts.payload) params.payload = opts.payload;
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, params);
  } catch (err) {
    var networkError = new Error('Network error during ' + stepName);
    networkError.name = 'PaidNetworkError';
    throw networkError;
  }
  var result = {
    statusCode: resp.getResponseCode(),
    body: resp.getContentText(),
  };

  if (result.statusCode === 401 && !didRetry) {
    // Two-step recovery so the user never sees the Reconnect card if their
    // Google identity is still valid:
    //   1) refreshApiKey_() — fast path; uses the existing key to mint a new
    //      one (works for rotations/extensions).
    //   2) tryIdentityExchange_() — fallback when the existing key is fully
    //      invalidated server-side (e.g., user revoked, regenerated, or the
    //      server pruned). Uses a fresh Google identity token with no
    //      dependence on the dead key.
    if (refreshApiKey_() || tryIdentityExchange_()) {
      return paidFetchWithRecovery_(path, opts, true, stepName);
    }
    var reconnectErr = new Error('API key refresh failed');
    reconnectErr.name = 'PaidAuthReconnectError';
    throw reconnectErr;
  }
  return result;
}

function checkHealth_() {
  var base = getApiBase_();
  if (!base) throw new Error('Missing API base URL');
  var resp = UrlFetchApp.fetch(base + '/api/health', {
    method: 'get',
    muteHttpExceptions: true,
    timeout: 8000,
  });
  if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
    throw new Error('Health check failed');
  }
}

function refreshApiKey_() {
  var base = getApiBase_();
  var key = getApiKey_();
  if (!base || !key) return false;
  var resp = UrlFetchApp.fetch(base + '/api/auth/api-key/refresh', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: '{}',
    muteHttpExceptions: true,
    timeout: 10000,
  });
  if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
    return false;
  }
  try {
    var j = JSON.parse(resp.getContentText());
    if (!j.api_key) return false;
    PropertiesService.getUserProperties().setProperty(PROP_API_KEY, String(j.api_key));
    setApiKeyExpiry_(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return true;
  } catch (err) {
    return false;
  }
}

function setApiKeyExpiry_(ts) {
  PropertiesService.getUserProperties().setProperty(PROP_API_KEY_EXPIRES_AT, String(ts));
}

function getApiKeyExpiry_() {
  var raw = PropertiesService.getUserProperties().getProperty(PROP_API_KEY_EXPIRES_AT) || '';
  var n = Number(raw);
  return isNaN(n) ? 0 : n;
}

var PROP_LAST_REFRESH_ATTEMPT_AT = 'PAID_LAST_REFRESH_ATTEMPT_AT';

function maybeProactiveRefresh_() {
  var exp = getApiKeyExpiry_();
  if (!exp) return;
  var threeDays = 3 * 24 * 60 * 60 * 1000;
  if (Date.now() < exp - threeDays) return;
  // Throttle: once a refresh attempt has run in the last hour, don't retry
  // on every card render. Prevents a stuck refresh (e.g., temporary backend
  // outage) from blowing 1s on every click during a usage burst.
  var props = PropertiesService.getUserProperties();
  var lastRaw = Number(props.getProperty(PROP_LAST_REFRESH_ATTEMPT_AT) || 0);
  if (Date.now() - lastRaw < 60 * 60 * 1000) return;
  props.setProperty(PROP_LAST_REFRESH_ATTEMPT_AT, String(Date.now()));
  refreshApiKey_();
}

function buildReconnectCard_(message) {
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader().setTitle('Paid').setSubtitle('Reconnect required - v' + VERSION)
    );
  card.addSection(
    CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(message))
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText('Reconnect')
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setOnClickAction(CardService.newAction().setFunctionName('onReconnectFromError'))
          )
          .addButton(
            CardService.newTextButton()
              .setText('Key page')
              .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
              .setOpenLink(CardService.newOpenLink().setUrl('https://paid-app.com/api/auth/api-key'))
          )
      )
  );
  return card.build();
}

function buildDiagnosticCard_(step, kind, msg, refreshFunctionName) {
  if (kind === 'auth') {
    return buildReconnectCard_(
      'Your connection expired. Enter your API key below to reconnect.'
    );
  }
  var details =
    'Step: ' +
    step +
    '\nType: ' +
    (kind === 'auth' ? 'auth error' : 'network error') +
    '\n' +
    msg;
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader().setTitle('Paid').setSubtitle('Diagnostics - v' + VERSION)
    );
  card.addSection(
    CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(details))
      .addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText('Reconnect')
              .setOnClickAction(CardService.newAction().setFunctionName('onReconnectFromError'))
          )
          .addButton(
            CardService.newTextButton()
              .setText('Refresh')
              .setOnClickAction(
                CardService.newAction().setFunctionName(refreshFunctionName || 'onRefreshHome')
              )
          )
      )
  );
  return card.build();
}

function getApiBase_() {
  // Fall back to the published default so a fresh install never has to type
  // the URL. Self-hosters can override via the Settings card or
  // PropertiesService directly.
  var stored = trimSlash_(
    PropertiesService.getUserProperties().getProperty(PROP_API) || ''
  );
  return stored || DEFAULT_API_BASE;
}

function getApiKey_() {
  return PropertiesService.getUserProperties().getProperty(PROP_API_KEY) || '';
}

/**
 * Try to obtain (or refresh) an API key using the active Google user's
 * identity. Returns true on success — the key is stored in UserProperties
 * exactly as the manual paste flow would. Returns false if the user has no
 * Paid account, or if any step fails (network, token, lookup).
 *
 * Safe to call before each home render when no key is set; ScriptApp's
 * identity token is cached by the runtime, so this is essentially a single
 * outbound HTTPS request to /api/gmail-addon/exchange when the user is
 * already on Paid.
 */
function tryIdentityExchange_() {
  var base = getApiBase_();
  if (!base) return false;
  var idToken;
  try {
    idToken = ScriptApp.getIdentityToken();
  } catch (err) {
    return false;
  }
  if (!idToken) return false;

  var resp;
  try {
    resp = UrlFetchApp.fetch(base + '/api/gmail-addon/exchange', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + idToken },
      payload: '{}',
      muteHttpExceptions: true,
      timeout: 10000,
    });
  } catch (netErr) {
    return false;
  }
  var code = resp.getResponseCode();
  if (code === 404) {
    // No matching Paid account — caller's UX path is to invite the user to
    // sign up at paid-app.com first. Leave properties untouched.
    return false;
  }
  if (code < 200 || code >= 300) {
    return false;
  }
  try {
    var j = JSON.parse(resp.getContentText());
    if (!j || !j.api_key) return false;
    PropertiesService.getUserProperties().setProperty(PROP_API_KEY, String(j.api_key));
    setApiKeyExpiry_(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (!PropertiesService.getUserProperties().getProperty(PROP_API)) {
      PropertiesService.getUserProperties().setProperty(PROP_API, DEFAULT_API_BASE);
    }
    return true;
  } catch (parseErr) {
    return false;
  }
}

/**
 * Same as tryIdentityExchange_ but returns the parsed response so the
 * connect card can distinguish "no Paid account yet" (NO_ACCOUNT) from
 * generic failure. The on-demand "Connect with Google" button uses this to
 * route the user to sign up if needed.
 */
function exchangeIdentityDetailed_() {
  var base = getApiBase_();
  if (!base) return { ok: false, reason: 'no_base' };
  var idToken;
  try {
    idToken = ScriptApp.getIdentityToken();
  } catch (err) {
    return { ok: false, reason: 'no_identity_token' };
  }
  if (!idToken) return { ok: false, reason: 'no_identity_token' };

  var resp;
  try {
    resp = UrlFetchApp.fetch(base + '/api/gmail-addon/exchange', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + idToken },
      payload: '{}',
      muteHttpExceptions: true,
      timeout: 10000,
    });
  } catch (netErr) {
    return { ok: false, reason: 'network' };
  }
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code === 404) {
    return { ok: false, reason: 'no_account', body: body };
  }
  if (code < 200 || code >= 300) {
    return { ok: false, reason: 'http_' + code, body: body };
  }
  try {
    var j = JSON.parse(body);
    if (!j || !j.api_key) return { ok: false, reason: 'no_key_in_response' };
    PropertiesService.getUserProperties().setProperty(PROP_API_KEY, String(j.api_key));
    setApiKeyExpiry_(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (!PropertiesService.getUserProperties().getProperty(PROP_API)) {
      PropertiesService.getUserProperties().setProperty(PROP_API, DEFAULT_API_BASE);
    }
    return { ok: true };
  } catch (parseErr) {
    return { ok: false, reason: 'parse_error' };
  }
}

function getUserDisplayName_() {
  var explicitName =
    PropertiesService.getUserProperties().getProperty(PROP_USER_DISPLAY_NAME) || '';
  if (explicitName) return explicitName;
  var base = getApiBase_();
  if (!base) return 'Paid Team';
  try {
    var host = base
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .split('.')[0];
    var cleaned = host.replace(/[^a-zA-Z]/g, '');
    if (!cleaned) return 'Paid Team';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  } catch (err) {
    return 'Paid Team';
  }
}

function trimSlash_(s) {
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

/** Whole dollars with commas (cohort row labels on mobile). */
function fmtMoneyCompact_(n) {
  if (n === undefined || n === null) return '$0';
  var num = Number(n);
  if (isNaN(num)) return '$0';
  var rounded = Math.round(num);
  var s = String(Math.abs(rounded));
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (rounded < 0) {
    return '-$' + s;
  }
  return '$' + s;
}

function fmtMoney_(n) {
  if (n === undefined || n === null) return '$0';
  var num = Number(n);
  if (isNaN(num)) return '$0';
  var fixed = num.toFixed(2);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Drop trailing .00 on whole-dollar amounts ($10,800 not $10,800.00).
  // For non-whole amounts ($10,800.42), keep the cents. Apple Wallet,
  // iOS Stocks, and most fintech UIs follow this rule.
  if (parts[1] === '00') return '$' + parts[0];
  return '$' + parts[0] + '.' + parts[1];
}

function n_(x) {
  return x === undefined || x === null ? 0 : x;
}

function uniqueLower_(arr) {
  var seen = {};
  var out = [];
  arr.forEach(function (a) {
    var k = a.toLowerCase();
    if (!seen[k]) {
      seen[k] = true;
      out.push(k);
    }
  });
  return out;
}

function extractEmailsFromMessage_(messageId, accessToken) {
  var url =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
    encodeURIComponent(messageId) +
    '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc';
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
    timeout: 10000,
  });
  if (resp.getResponseCode() !== 200) return [];
  var json = JSON.parse(resp.getContentText());
  var headers = (json.payload && json.payload.headers) || [];
  var emails = [];
  headers.forEach(function (h) {
    if (!h.name || !h.value) return;
    var n = h.name.toLowerCase();
    if (n === 'from' || n === 'to' || n === 'cc') {
      extractEmailsFromHeader_(h.value).forEach(function (e) {
        emails.push(e);
      });
    }
  });
  return uniqueLower_(emails);
}

function extractEmailsFromHeader_(value) {
  var out = [];
  var re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  var m;
  while ((m = re.exec(value)) !== null) {
    out.push(m[0].toLowerCase());
  }
  return out;
}

function extractEmail_(recipient) {
  if (!recipient) return '';
  if (typeof recipient === 'string') {
    var m = recipient.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? m[0].toLowerCase() : '';
  }
  if (recipient.email) return String(recipient.email).toLowerCase();
  return '';
}

function getFormText_(form, name) {
  if (!form || !form[name]) return '';
  var field = form[name];
  if (!field || !field.length) return '';
  var v = field[0];
  if (typeof v === 'string') return v;
  if (v && typeof v.getContent === 'function') return v.getContent();
  return String(v);
}

/* ========== Reply classification (Paid v2) ========== */

/** Read the From: header for a message and return the sender email (lowercased), or '' if unknown. */
function extractFromEmail_(messageId, accessToken) {
  var meta = extractMessageMeta_(messageId, accessToken);
  return meta.from;
}

/**
 * Single metadata fetch that returns sender, all participants, AND INBOX
 * status in one Gmail API call. Replaces what used to be two separate
 * fetches (extractFromEmail_ + extractEmailsFromMessage_) — saves one
 * round-trip on every contextual card render.
 *
 * Returns { from: string, isInbox: boolean, participants: string[] }.
 */
function extractMessageMeta_(messageId, accessToken) {
  // Uses GmailApp instead of the per-message OAuth token because Apps Script's
  // e.gmail.accessToken returns 401 for users when invoked from non-contextual
  // code paths (action handlers on pushed cards in particular). GmailApp uses
  // the script's own user-granted gmail.readonly scope which works everywhere.
  // The accessToken parameter is kept for signature compatibility but unused.
  var empty = { from: '', isInbox: false, participants: [] };
  if (!messageId) return empty;
  try {
    var msg = GmailApp.getMessageById(messageId);
    if (!msg) return empty;
    var thread = msg.getThread();
    var isInbox = false;
    try {
      var labels = thread ? thread.getLabels() : [];
      // GmailApp.getLabels() returns user labels only — INBOX is a system
      // label. Use thread.isInInbox() instead for the system INBOX check.
      isInbox = thread ? thread.isInInbox() : false;
      // labels variable kept for potential future per-label logic
      void labels;
    } catch (lblErr) { /* ignore label fetch errors */ }
    var fromHeader = msg.getFrom() || '';
    var toHeader = msg.getTo() || '';
    var ccHeader = msg.getCc() || '';
    var fromEmails = extractEmailsFromHeader_(fromHeader);
    var toEmails = extractEmailsFromHeader_(toHeader);
    var ccEmails = extractEmailsFromHeader_(ccHeader);
    var all = [];
    fromEmails.forEach(function (e) { all.push(e); });
    toEmails.forEach(function (e) { all.push(e); });
    ccEmails.forEach(function (e) { all.push(e); });
    return {
      from: fromEmails.length ? fromEmails[0] : '',
      isInbox: isInbox,
      participants: uniqueLower_(all),
    };
  } catch (err) {
    return empty;
  }
}

/**
 * Fetch a Gmail message body. Returns the decoded plain-text body, falling
 * back to the snippet via a lighter-privilege metadata call when format=full
 * is rejected (Tommy's per-message accessToken was returning empty bodies on
 * the action-handler path, blocking auto-classify on every reply).
 *
 * Returns '' on every failure for backward compatibility. Callers that want
 * the response code for diagnostics should call fetchMessageTextWithStatus_.
 */
function fetchMessagePlainText_(messageId, accessToken) {
  var r = fetchMessageTextWithStatus_(messageId, accessToken);
  return r.text || '';
}

/**
 * Returns `{ text, source, errorCode, errorBody }`. Uses GmailApp instead of
 * the per-message UrlFetchApp path that hit 401 from action handlers. The
 * accessToken parameter is kept for signature compatibility but unused —
 * GmailApp uses the script's user-granted gmail.readonly scope, which works
 * in both contextual and action contexts.
 */
function fetchMessageTextWithStatus_(messageId, accessToken) {
  if (!messageId) {
    return { text: '', source: 'none', errorCode: 0, errorBody: 'no_message_id' };
  }
  try {
    var msg = GmailApp.getMessageById(messageId);
    if (!msg) {
      return { text: '', source: 'none', errorCode: 0, errorBody: 'message_not_found' };
    }
    // getPlainBody() returns the decoded plain-text body, stripping HTML if
    // only an HTML part exists. Falls back to getBody() (HTML) if needed.
    var plain = '';
    try { plain = msg.getPlainBody() || ''; } catch (e) { /* ignore */ }
    if (plain && plain.trim()) {
      return { text: plain, source: 'gmailapp-plain', errorCode: 0, errorBody: '' };
    }
    var html = '';
    try { html = msg.getBody() || ''; } catch (e2) { /* ignore */ }
    if (html) {
      var stripped = html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (stripped) {
        return { text: stripped, source: 'gmailapp-html-stripped', errorCode: 0, errorBody: '' };
      }
    }
    // Last resort: thread/message snippet via the Advanced Gmail Service if
    // enabled; otherwise return the subject so we at least have something
    // for the classifier to work with.
    var subject = '';
    try { subject = msg.getSubject() || ''; } catch (e3) { /* ignore */ }
    if (subject) {
      return { text: subject, source: 'gmailapp-subject', errorCode: 0, errorBody: '' };
    }
    return { text: '', source: 'none', errorCode: 0, errorBody: 'empty_message' };
  } catch (err) {
    return {
      text: '',
      source: 'none',
      errorCode: 0,
      errorBody: 'GmailApp error: ' + (err && err.message ? err.message : String(err)),
    };
  }
}

function walkPartsForText_(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeB64Url_(payload.body.data);
  }
  var parts = payload.parts || [];
  for (var i = 0; i < parts.length; i++) {
    var found = walkPartsForText_(parts[i]);
    if (found) return found;
  }
  // Fallback: HTML, stripped of tags.
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    var html = decodeB64Url_(payload.body.data);
    return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function decodeB64Url_(s) {
  var b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  var padding = b64.length % 4;
  if (padding) b64 += new Array(5 - padding).join('=');
  try {
    return Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
  } catch (err) {
    return '';
  }
}

/** Action: classify the open Gmail message as a reply and show suggestion. */
function onClassifyReply(e) {
  var p = (e && e.parameters) || {};
  var messageId = p.messageId;
  var fromEmail = (p.fromEmail || '').toLowerCase();
  var access = e && e.gmail && e.gmail.accessToken;
  if (!messageId || !access) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Open the message first, then try again.'))
      .build();
  }

  var bodyText = fetchMessagePlainText_(messageId, access);
  if (!bodyText) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not read this message body.'))
      .build();
  }

  try {
    var res = paidFetch_('/api/replies/classify', {
      method: 'post',
      payload: JSON.stringify({
        threadId: messageId,
        clientEmail: fromEmail || undefined,
        replyText: bodyText,
      }),
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    return CardService.newActionResponseBuilder()
      .setNavigation(
        CardService.newNavigation().pushCard(buildClassificationResultCard_(data, fromEmail))
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Enter your API key below to reconnect.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Could not classify this reply. Try again.'))
      .build();
  }
}

function buildClassificationResultCard_(data, fromEmail) {
  var headline = classificationHeadline_(data.classification);
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader().setTitle('Reply read').setSubtitle(headline)
    );

  var sec = CardService.newCardSection();
  if (fromEmail) {
    sec.addWidget(CardService.newDecoratedText().setTopLabel('From').setText(fromEmail));
  }
  if (data.suggestedAction) {
    sec.addWidget(CardService.newDecoratedText().setTopLabel('Suggested next step').setText(data.suggestedAction));
  }
  if (data.classification === 'will_pay_later' && data.promisedPayDate) {
    sec.addWidget(CardService.newDecoratedText().setTopLabel('Client promised by').setText(data.promisedPayDate));
  }
  if (data.scheduledFor) {
    sec.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Follow-up scheduled')
        .setText(data.scheduledFor)
        .setBottomLabel('We will draft a fresh reminder for that day.')
    );
  }
  if (data.excerpt) {
    sec.addWidget(CardService.newTextParagraph().setText('"' + data.excerpt + '"'));
  }

  // Action: suggest a payment plan when the client says they cannot pay or asks for one.
  if (
    data.invoiceId &&
    (data.classification === 'cannot_pay' || data.classification === 'payment_plan_request')
  ) {
    sec.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Suggest payment plan')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('onSuggestPaymentPlan')
              .setParameters({ invoiceId: String(data.invoiceId) })
          )
      )
    );
  }

  card.addSection(sec);
  return card.build();
}

function classificationHeadline_(c) {
  switch (c) {
    case 'will_pay_later': return 'Client says: paying later';
    case 'cannot_pay': return 'Client says: cannot pay right now';
    case 'payment_plan_request': return 'Client wants a payment plan';
    case 'invoice_issue': return 'Client raised an issue with the invoice';
    case 'paid_already': return 'Client says they already paid';
    case 'unrelated': return 'Reply is unrelated to the invoice';
    default: return 'Reply classification';
  }
}

function classificationShortLabel_(c) {
  switch (c) {
    case 'will_pay_later': return 'Paying later';
    case 'cannot_pay': return 'Cannot pay';
    case 'payment_plan_request': return 'Wants plan';
    case 'invoice_issue': return 'Disputed';
    case 'paid_already': return 'Already paid?';
    case 'unrelated': return 'Unrelated';
    default: return 'Reply';
  }
}

/**
 * "Recent reminders" section on the home card — outgoing reminder log so the
 * user sees what they've sent recently across all clients in one glance.
 * Mirrors the per-contact timeline that shows on the contextual / compose
 * card, but global instead of contact-scoped.
 */
function buildRecentRemindersSectionFromPack_(items) {
  try {
    if (!items || !items.length) return null;
    var sec = CardService.newCardSection().setHeader('Recent reminders');
    items.slice(0, 5).forEach(function (item, idx) {
      if (idx > 0) sec.addWidget(CardService.newDivider());
      var date = (item.createdAt || '').slice(0, 10);
      var clientName = (item.invoice && item.invoice.client_name) || item.sentTo || 'Client';
      var bottomBits = [];
      if (item.tone) bottomBits.push(capitalize_(item.tone) + ' tone');
      if (item.payLinkIncluded) bottomBits.push('Pay Now');
      if (item.discountPct) bottomBits.push(item.discountPct + '% discount');
      var widget = CardService.newDecoratedText()
        .setTopLabel(date + ' · ' + clientName)
        .setText(item.subject || '(no subject)')
        .setBottomLabel(bottomBits.join(' · '))
        .setWrapText(true);
      // Tap to view full history for that invoice.
      if (item.invoiceId) {
        widget.setOnClickAction(
          CardService.newAction()
            .setFunctionName('onShowInvoiceHistory')
            .setParameters({ invoiceId: String(item.invoiceId) })
        );
      }
      sec.addWidget(widget);
    });
    return sec;
  } catch (err) {
    return null;
  }
}

/**
 * "Activity" section on the home card — recent client replies the system has classified,
 * with quick actions. Receives items already loaded by /api/gmail/home-pack so this is
 * synchronous (no second network call).
 */
function buildActivitySectionFromPack_(items) {
  try {
    if (!items || !items.length) return null;

    var sec = CardService.newCardSection().setHeader('Activity');
    items.slice(0, 6).forEach(function (item, idx) {
      if (idx > 0) sec.addWidget(CardService.newDivider());
      var label = classificationShortLabel_(item.classification);
      var topLabel = (item.invoice && item.invoice.client_name) || item.clientEmail || 'Client reply';
      var bottomBits = [];
      if (item.classification === 'will_pay_later' && item.promisedPayDate) {
        bottomBits.push('Promised by ' + item.promisedPayDate);
      }
      if (item.nextFollowup) {
        bottomBits.push('Follow-up ' + item.nextFollowup);
      }
      if (item.invoice && item.invoice.days_overdue != null) {
        bottomBits.push(item.invoice.days_overdue + 'd overdue');
      }
      sec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(topLabel)
          .setText(label + (item.invoice && item.invoice.amount ? ' · ' + fmtMoney_(item.invoice.amount) : ''))
          .setBottomLabel(bottomBits.join(' · ') || (item.suggestedAction || ''))
          .setWrapText(true)
      );

      if (
        item.invoiceId &&
        (item.classification === 'cannot_pay' || item.classification === 'payment_plan_request')
      ) {
        sec.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText('Suggest payment plan')
              .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('onSuggestPaymentPlan')
                  .setParameters({ invoiceId: String(item.invoiceId) })
              )
          )
        );
      }
    });
    return sec;
  } catch (err) {
    return null;
  }
}

/**
 * Action: build a payment plan template and open it in a Gmail compose window.
 * Used both from the Activity feed and from the classification result card.
 */
function onSuggestPaymentPlan(e) {
  var p = (e && e.parameters) || {};
  var id = p.invoiceId;
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }

  try {
    var res = paidFetch_('/api/invoices/payment-plan-template', {
      method: 'post',
      payload: JSON.stringify({ invoiceId: id }),
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
        )
        .build();
    }
    var data = JSON.parse(res.body);
    var url =
      'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(data.to || '') +
      '&su=' + encodeURIComponent(data.subject || '') +
      '&body=' + encodeURIComponent(data.body || '');
    return CardService.newActionResponseBuilder()
      .setOpenLink(
        CardService.newOpenLink()
          .setUrl(url)
          .setOpenAs(CardService.OpenAs.OVERLAY)
      )
      .setNotification(
        CardService.newNotification().setText(
          'Payment plan template opened in Gmail (' + (data.installments || 3) + ' installments).'
        )
      )
      .build();
  } catch (err) {
    if (err && err.name === 'PaidAuthReconnectError') {
      return CardService.newActionResponseBuilder()
        .setNavigation(
          CardService.newNavigation().updateCard(
            buildReconnectCard_('Your connection expired. Enter your API key below to reconnect.')
          )
        )
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Could not build payment plan template.')
      )
      .build();
  }
}

/**
 * Look up prior classifications for an open Gmail thread so the contextual
 * card can surface "we already classified this — here is what they said
 * and what we scheduled." 60-second memcache so repeat thread-opens
 * within a working session render near-instant. Mutations (new
 * classification posted) bust the cache for that thread.
 */
var PRIOR_CLASSIFY_TTL_S = 60;
function priorClassifyCacheKey_(threadId) {
  return 'paid_prior_classify_' + String(threadId || '');
}

function fetchPriorClassificationsForThread_(threadId) {
  if (!threadId) return [];
  var key = priorClassifyCacheKey_(threadId);
  try {
    var hit = CacheService.getUserCache().get(key);
    if (hit) {
      var parsed = JSON.parse(hit);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (cacheErr) {
    // Fall through to network.
  }
  try {
    var res = paidFetch_(
      '/api/replies/by-thread?threadId=' + encodeURIComponent(threadId),
      { method: 'get' },
      'replies-by-thread'
    );
    if (res.statusCode !== 200) return [];
    var data = JSON.parse(res.body);
    var items = (data && data.items) || [];
    try {
      CacheService.getUserCache().put(
        key,
        JSON.stringify(items),
        PRIOR_CLASSIFY_TTL_S
      );
    } catch (writeErr) { /* ignore */ }
    return items;
  } catch (err) {
    return [];
  }
}

function clearPriorClassifyCache_(threadId) {
  try {
    CacheService.getUserCache().remove(priorClassifyCacheKey_(threadId));
  } catch (err) { /* ignore */ }
}
