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
var VERSION = '1.3.7';

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
function buildReplyDraftUrl_(classificationRow, clientEmail) {
  var kind = (classificationRow && classificationRow.classification) || 'other';
  var promisedDate = (classificationRow && classificationRow.promisedPayDate) || '';
  var ownName = getUserDisplayName_() || 'Paid';
  var body;
  switch (kind) {
    case 'will_pay_later':
      body =
        'Hi,\n\n' +
        'Thanks for the update — really appreciate you keeping me posted. ' +
        (promisedDate
          ? "I'll plan to check in shortly after " + promisedDate + '. '
          : "I'll plan to follow up around your expected date. ") +
        "Let me know if anything changes before then.\n\n" +
        'Thanks,\n' + ownName;
      break;
    case 'cannot_pay':
      body =
        'Hi,\n\n' +
        "Thanks for being upfront — appreciate it. Let's find something that works on both ends. " +
        "Happy to set up a payment plan, accept a partial payment, or extend the due date. " +
        "What feels reasonable for you this month?\n\n" +
        'Thanks,\n' + ownName;
      break;
    case 'payment_plan_request':
      body =
        'Hi,\n\n' +
        "Happy to work with you on this. Two options that work on our end:\n" +
        "  - 3 monthly installments (equal thirds)\n" +
        "  - 50% now, 50% in 30 days\n\n" +
        "Either works, or if a different schedule fits your cash flow, just let me know.\n\n" +
        'Thanks,\n' + ownName;
      break;
    case 'invoice_issue':
      body =
        'Hi,\n\n' +
        "Thanks for flagging this. Could you tell me which line item is the concern? " +
        "I'll pull our records and get back to you today.\n\n" +
        'Thanks,\n' + ownName;
      break;
    case 'paid_already':
      body =
        'Hi,\n\n' +
        "Thanks for letting me know — I'll double-check our records. " +
        "If you have a check number, transfer date, or screenshot, that would help me reconcile faster. " +
        "I'll confirm receipt as soon as it shows up on our side.\n\n" +
        'Thanks,\n' + ownName;
      break;
    default:
      body =
        'Hi,\n\n' +
        "Thanks for the note. Let me know if there's anything else I can help with from my side.\n\n" +
        'Thanks,\n' + ownName;
  }
  return 'https://mail.google.com/mail/?view=cm&fs=1' +
    '&to=' + encodeURIComponent(clientEmail || '') +
    '&su=' + encodeURIComponent('Re: Your invoice') +
    '&body=' + encodeURIComponent(body);
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

function buildInvoiceHistoryCard_(data) {
  var inv = data.invoice || {};
  var reminders = data.reminders || [];
  var replies = data.replies || [];
  var schedules = data.schedules || [];

  // Header: client name is the title (their identity matters), money +
  // invoice number is the subtitle (the data). Was "History" /
  // "{client} · ${amount}" which made the card title generic and buried
  // the client identity.
  var card = CardService.newCardBuilder()
    .setDisplayStyle(CardService.DisplayStyle.REPLACE)
    .setHeader(
      CardService.newCardHeader()
        .setTitle(inv.clientName || 'Client')
        .setSubtitle(
          fmtMoney_(inv.amount || 0) +
          (inv.quickbooksInvoiceId ? ' · Invoice ' + inv.quickbooksInvoiceId : '')
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
    repSec.addWidget(
      CardService.newDecoratedText()
        .setText('No responses yet')
        .setBottomLabel('When the client replies, Paid classifies it here and offers a drafted response.')
        .setWrapText(true)
    );
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

    // Mark the invoice as sent + write reminder_logs in the background. We
    // don't block draft creation on this — even if the merchant doesn't
    // actually click Send in Gmail, the next draft refresh + sync will reset
    // state. This is the same optimistic logging the (now-removed) "Open in
    // Gmail to send" button used.
    if (id && cached) {
      try {
        paidFetch_('/api/invoices/send-reminder', {
          method: 'post',
          payload: JSON.stringify({
            invoiceId: id,
            subject: subj,
            body: body,
            channel: 'addon',
            tone: cached.tone || null,
            payNowIncluded: !!cached.payNowIncluded,
          }),
        });
        clearReminderDraft_(id);
      } catch (logErr) {
        // Non-fatal — the draft is in Gmail; tracking just won't update.
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

    // Single primary action only when there's something to review. No
    // floating button when the action queue is empty.
    if (overdue.length > 0) {
      var foot = CardService.newCardSection();
      foot.addWidget(
        CardService.newButtonSet()
          .addButton(
            CardService.newTextButton()
              .setText('Review all reminders')
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setOnClickAction(CardService.newAction().setFunctionName('onQueueAllReminders'))
          )
      );
      card.addSection(foot);
    }

    card.addCardAction(
      CardService.newCardAction()
        .setText('Refresh')
        .setOnClickAction(CardService.newAction().setFunctionName('onRefreshHome'))
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

  var emails = extractEmailsFromMessage_(messageId, access);
  // Drop the merchant's own address — calling /api/contacts/activity for
  // themselves just returns empty and rendered as "No invoices on record"
  // which looks broken. We want client contacts only.
  var ownEmail = getOwnEmailLower_();
  if (ownEmail) {
    emails = emails.filter(function (em) { return em !== ownEmail; });
  }
  // One metadata roundtrip gives us From + INBOX status. INBOX presence
  // means the message was RECEIVED (vs only sent). The classify gate uses
  // both: the message can be an inbound reply even when the From address
  // is the merchant's own (self-test loop, alias-of-own-domain, forwarded).
  var meta = extractMessageMeta_(messageId, access);
  var fromEmail = meta.from;
  var isInbox = meta.isInbox;

  // No useful contextual content for this thread — drop the merchant into
  // the home dashboard view instead of a dead-end "no client contacts on
  // this thread" card. The home dashboard is always useful.
  if (!emails.length && (!fromEmail || fromEmail === ownEmail)) {
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
          }
        }
      } catch (autoErr) {
        // ignore — fall through to manual Classify button
      }
    }
    var classifySec = CardService.newCardSection();

    if (prior && prior.length > 0) {
      var last = prior[0];
      var bottomBits = [];
      if (last.promisedPayDate) bottomBits.push('Promised by ' + last.promisedPayDate);
      if (last.autoScheduledFor) bottomBits.push('Auto follow-up ' + last.autoScheduledFor);
      if (last.suggestedAction) bottomBits.push(last.suggestedAction);
      classifySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('Reply read ' + (last.createdAt || '').slice(0, 10))
          .setText(classificationHeadline_(last.classification))
          .setBottomLabel(bottomBits.join(' · '))
          .setWrapText(true)
      );
      // Primary CTA: draft a reply tailored to the classification. Opens
      // Gmail compose with subject + body prefilled; user edits and clicks
      // Send themselves. This is the "suggested reply" Tommy was missing.
      var draftReplyUrl = buildReplyDraftUrl_(last, clientEmailForClassify);
      classifySec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Draft response')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOpenLink(
              CardService.newOpenLink()
                .setUrl(draftReplyUrl)
                .setOpenAs(CardService.OpenAs.FULL_SIZE)
            )
        )
      );

      if (
        last.invoiceId &&
        (last.classification === 'cannot_pay' || last.classification === 'payment_plan_request')
      ) {
        classifySec.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText('Payment plan offer')
              .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('onSuggestPaymentPlan')
                  .setParameters({ invoiceId: String(last.invoiceId) })
              )
          )
        );
      }
      classifySec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Re-classify')
            .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onClassifyReply')
                .setParameters({
                  messageId: replyContext.messageId,
                  fromEmail: clientEmailForClassify,
                })
            )
        )
      );
    } else if (isOutbound) {
      // The open message looks like the merchant's own outbound. Default UX
      // is to skip the classify prompt — but expose a manual override so
      // self-test flows (sending to your own address) and edge cases
      // (replying from an alias of your own domain) can still be classified
      // on demand. Without this button there's no way to test the reply
      // pipeline with your own email.
      classifySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('You sent or replied to this')
          .setText('Auto-classify skipped')
          .setBottomLabel(
            "We skip auto-classify on your own outbound. Tap below if you want to classify this thread anyway (useful for testing)."
          )
          .setWrapText(true)
      );
      classifySec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Classify this thread')
            .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onClassifyReply')
                .setParameters({
                  messageId: replyContext.messageId,
                  fromEmail: clientEmailForClassify || replyContext.fromEmail || '',
                })
            )
        )
      );
    } else {
      classifySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('This looks like a reply')
          .setText('Classify with Paid')
          .setBottomLabel('We will read it and suggest the next step.')
      );
      classifySec.addWidget(
        CardService.newButtonSet().addButton(
          CardService.newTextButton()
            .setText('Classify reply')
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
      var res = paidFetch_(
        '/api/contacts/activity?email=' + encodeURIComponent(email),
        { method: 'get' }
      );
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

      // Summary row: outstanding, overdue count, recovered, reminders sent
      var summarySec = CardService.newCardSection();
      summarySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(email)
          .setText(clientName)
          .setBottomLabel(
            (totals.overdueCount || 0) + ' overdue \u00b7 ' +
            (totals.invoiceCount || 0) + ' total invoices'
          )
          .setWrapText(true)
      );
      summarySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('Outstanding')
          .setText(fmtMoney_(totals.outstanding || 0))
      );
      if ((totals.recovered || 0) > 0) {
        summarySec.addWidget(
          CardService.newDecoratedText()
            .setTopLabel('Recovered (since first reminder)')
            .setText(fmtMoney_(totals.recovered))
        );
      }
      summarySec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel('Reminders sent')
          .setText(String(totals.remindersSent || 0))
          .setBottomLabel(
            (totals.replyCount || 0) > 0
              ? (totals.replyCount + ' reply' + (totals.replyCount === 1 ? '' : 'ies') + ' classified')
              : 'No replies classified'
          )
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

      // Recent reminders (last 5)
      if (reminders.length) {
        var remSec = CardService.newCardSection().setHeader('Recent reminders');
        reminders.slice(0, 5).forEach(function (r, idx) {
          if (idx > 0) remSec.addWidget(CardService.newDivider());
          var dateLabel = (r.created_at || '').slice(0, 10);
          var bottomBits = [];
          if (r.tone) bottomBits.push(capitalize_(r.tone) + ' tone');
          if (r.pay_link_included) bottomBits.push('Pay Now included');
          if (r.channel) bottomBits.push('via ' + r.channel);
          remSec.addWidget(
            CardService.newDecoratedText()
              .setTopLabel(dateLabel)
              .setText(r.subject || '(no subject)')
              .setBottomLabel(bottomBits.join(' \u00b7 '))
              .setWrapText(true)
          );
        });
        builder.addSection(remSec);
        sectionsAdded++;
      }

      // Recent replies (last 3)
      if (replies.length) {
        var repSec = CardService.newCardSection().setHeader('Recent replies');
        replies.slice(0, 3).forEach(function (rep, idx) {
          if (idx > 0) repSec.addWidget(CardService.newDivider());
          var dateLabel = (rep.created_at || '').slice(0, 10);
          var bottom = '';
          if (rep.classification === 'will_pay_later' && rep.promised_pay_date) {
            bottom = 'Promised by ' + rep.promised_pay_date;
          } else if (rep.suggested_action) {
            bottom = rep.suggested_action;
          }
          repSec.addWidget(
            CardService.newDecoratedText()
              .setTopLabel(dateLabel)
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
  if (c === 401 || c === 403) {
    return 'Paid rejected the request (auth). Reconnect from Settings.';
  }
  if (c === 404) {
    return 'Paid endpoint missing (404). The server may be deploying — try again in a minute.';
  }
  if (c === 429) {
    return 'Paid is rate-limiting (429). Try again in a few seconds.';
  }
  if (c >= 500 && c < 600) {
    return 'Paid server error (' + c + '). Try again — if it persists, refresh the sidebar.';
  }
  if (c === 0) {
    return 'Could not reach Paid (network). Check your connection and try again.';
  }
  return 'Paid request failed (HTTP ' + c + '). Try again.';
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
 * Single metadata fetch that returns both the sender email AND whether the
 * message is in the user's INBOX. Used to fix the self-reply test loop:
 * when Tommy replies from his own account to his own reminder, the From
 * header is his own address but the message lands in INBOX. Without the
 * label check, the old gate (fromEmail !== ownEmail) blocked it as "your
 * own outbound" — even though it was actually a received reply.
 *
 * Returns { from: string, isInbox: boolean }.
 */
function extractMessageMeta_(messageId, accessToken) {
  var empty = { from: '', isInbox: false };
  var url =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
    encodeURIComponent(messageId) +
    '?format=metadata&metadataHeaders=From';
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
  } catch (err) {
    return empty;
  }
  if (resp.getResponseCode() !== 200) return empty;
  var json;
  try {
    json = JSON.parse(resp.getContentText());
  } catch (parseErr) {
    return empty;
  }
  var labels = json.labelIds || [];
  var isInbox = false;
  for (var li = 0; li < labels.length; li++) {
    if (labels[li] === 'INBOX') { isInbox = true; break; }
  }
  var from = '';
  var headers = (json.payload && json.payload.headers) || [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h.name && h.name.toLowerCase() === 'from') {
      var emails = extractEmailsFromHeader_(h.value);
      if (emails && emails.length) { from = emails[0]; break; }
    }
  }
  return { from: from, isInbox: isInbox };
}

/** Fetch a Gmail message and return its plain-text body (decoded). */
function fetchMessagePlainText_(messageId, accessToken) {
  var url =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
    encodeURIComponent(messageId) +
    '?format=full';
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
    timeout: 10000,
  });
  if (resp.getResponseCode() !== 200) return '';
  var json = JSON.parse(resp.getContentText());
  return walkPartsForText_(json.payload) || (json.snippet ? String(json.snippet) : '');
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
 * Look up prior classifications for an open Gmail thread so the contextual card
 * can surface "we already classified this — here is what they said and what we
 * scheduled."
 */
function fetchPriorClassificationsForThread_(threadId) {
  if (!threadId) return [];
  try {
    var res = paidFetch_(
      '/api/replies/by-thread?threadId=' + encodeURIComponent(threadId),
      { method: 'get' }
    );
    if (res.statusCode !== 200) return [];
    var data = JSON.parse(res.body);
    return (data && data.items) || [];
  } catch (err) {
    return [];
  }
}
