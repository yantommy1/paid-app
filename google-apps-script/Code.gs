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
var VERSION = '1.0.1';

var PROP_API = 'PAID_API_BASE';
var PROP_API_KEY = 'PAID_API_KEY';
var PROP_API_KEY_EXPIRES_AT = 'PAID_API_KEY_EXPIRES_AT';
var PROP_USER_DISPLAY_NAME = 'PAID_USER_DISPLAY_NAME';

/** Cohort dot swatches (Linear-style accents) */
var DOT_90 = 'https://placehold.co/10x10/dc2626/dc2626.png';
var DOT_60 = 'https://placehold.co/10x10/ea580c/ea580c.png';
var DOT_30 = 'https://placehold.co/10x10/ca8a04/ca8a04.png';
var DOT_OK = 'https://placehold.co/10x10/16a34a/16a34a.png';

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
      return CardService.newActionResponseBuilder()
        .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
        .setNotification(CardService.newNotification().setText('Drafted. Adjust tone below.'))
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
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
      .setNotification(CardService.newNotification().setText('Drafted (' + autoTone + ' tone). Tap any tone to switch.'))
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

  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('History')
      .setSubtitle((inv.clientName || 'Client') + ' · ' + fmtMoney_(inv.amount || 0))
  );

  // Header summary section
  var summary = CardService.newCardSection();
  summary.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Invoice ' + (inv.quickbooksInvoiceId || ''))
      .setText(fmtMoney_(inv.amount || 0))
      .setBottomLabel(
        (inv.daysOverdue || 0) + ' days overdue · due ' + (inv.dueDate || '')
      )
  );
  card.addSection(summary);

  // Scheduled follow-ups section — what's planned next.
  if (schedules.length) {
    var schedSec = CardService.newCardSection().setHeader('Planned follow-ups');
    schedules.forEach(function (s, i) {
      if (i > 0) schedSec.addWidget(CardService.newDivider());
      schedSec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(s.scheduled_for || '')
          .setText('Auto follow-up')
          .setBottomLabel(s.reason || '')
          .setWrapText(true)
      );
    });
    card.addSection(schedSec);
  } else {
    var emptySched = CardService.newCardSection().setHeader('Planned follow-ups');
    emptySched.addWidget(
      CardService.newTextParagraph().setText(
        'No automated follow-up scheduled. Click any client reply on this invoice and we will plan the next step.'
      )
    );
    card.addSection(emptySched);
  }

  // Reminder log section — what we sent.
  var remSec = CardService.newCardSection().setHeader('Reminders sent');
  if (!reminders.length) {
    remSec.addWidget(CardService.newTextParagraph().setText('No reminders sent yet.'));
  } else {
    reminders.forEach(function (r, i) {
      if (i > 0) remSec.addWidget(CardService.newDivider());
      var bits = [];
      if (r.tone) bits.push(capitalize_(r.tone) + ' tone');
      if (r.pay_link_included) bits.push('Pay Now included');
      if (r.channel) bits.push(r.channel);
      remSec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel((r.created_at || '').slice(0, 10))
          .setText(r.subject || '(no subject)')
          .setBottomLabel(bits.join(' · '))
          .setWrapText(true)
      );
    });
  }
  card.addSection(remSec);

  // Reply log section — what the client said.
  var repSec = CardService.newCardSection().setHeader('Client replies');
  if (!replies.length) {
    repSec.addWidget(CardService.newTextParagraph().setText('No replies classified yet.'));
  } else {
    replies.forEach(function (rep, i) {
      if (i > 0) repSec.addWidget(CardService.newDivider());
      var bottom = '';
      if (rep.classification === 'will_pay_later' && rep.promised_pay_date) {
        bottom = 'Promised by ' + rep.promised_pay_date;
      } else if (rep.suggested_action) {
        bottom = rep.suggested_action;
      }
      repSec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel((rep.created_at || '').slice(0, 10))
          .setText(classificationHeadline_(rep.classification))
          .setBottomLabel(bottom)
          .setWrapText(true)
      );
    });
  }
  card.addSection(repSec);

  // Quick actions
  var actions = CardService.newCardSection();
  actions.addWidget(
    CardService.newButtonSet()
      .addButton(
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
  card.addSection(actions);

  return card.build();
}

/**
 * Action: open Stripe Connect onboarding in a new tab so the merchant can
 * set up payments without leaving Gmail to find Settings.
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
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText('Stripe is already connected. Reload the home card.')
        )
        .setNavigation(CardService.newNavigation().updateCard(buildHomePage_({})))
        .build();
    }
    if (data.onboardingUrl) {
      return CardService.newActionResponseBuilder()
        .setOpenLink(
          CardService.newOpenLink()
            .setUrl(data.onboardingUrl)
            .setOpenAs(CardService.OpenAs.OVERLAY)
        )
        .setNotification(
          CardService.newNotification().setText('Opening Stripe — finish setup, then come back to Gmail.')
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

  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle('Draft').setSubtitle('Your AI-drafted reminder')
  );

  card.addSection(
    CardService.newCardSection()
      .addWidget(
        CardService.newDecoratedText()
          .setText(subj || 'No subject')
          .setWrapText(true)
      )
      .addWidget(
        CardService.newTextParagraph().setText(truncateDraftBodyMobile_(body))
      )
  );

  // Compact Pay Now status badge — uses an icon, not a wall of body-text.
  var statusSec = CardService.newCardSection();
  if (payNowIncluded) {
    statusSec.addWidget(
      CardService.newDecoratedText()
        .setStartIcon(
          CardService.newIconImage().setIcon(CardService.Icon.DOLLAR)
        )
        .setText('Pay Now active')
        .setBottomLabel('This email includes a Stripe Checkout link.')
    );
  } else {
    statusSec.addWidget(
      CardService.newDecoratedText()
        .setStartIcon(
          CardService.newIconImage().setIcon(CardService.Icon.DOLLAR)
        )
        .setText('No Pay Now button')
        .setBottomLabel('Connect Stripe to let clients pay in one click.')
    );
    statusSec.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Connect Stripe')
          .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
          .setOnClickAction(
            CardService.newAction().setFunctionName('onStartStripeConnect')
          )
      )
    );
  }
  card.addSection(statusSec);

  // Tone control — re-drafts the body when tapped.
  var toneSec = CardService.newCardSection().setHeader('Tone');
  toneSec.addWidget(
    CardService.newTextParagraph().setText(
      'Slide from friendly to firm. We pre-pick based on the client\'s payment history and the invoice size — tap to override.'
    )
  );
  var toneRow = CardService.newButtonSet();
  ['friendly', 'professional', 'firm'].forEach(function (t) {
    var label = capitalize_(t);
    var btn = CardService.newTextButton()
      .setText(t === tone ? '● ' + label : label)
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

  // Single "Edit in Gmail" action — creates a real Gmail draft via CardService
  // compose action so the user reviews + sends in Gmail directly. The compose
  // action handler also fires the backend mark-as-sent / log call so we keep
  // tracking even though the user hits Send in Gmail.
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

  card.addSection(CardService.newCardSection().addWidget(btnRow));

  return card.build();
}

function formatHeaderLine_(header) {
  if (!header) return '';
  var total = fmtMoney_(header.totalOutstanding);
  var clients = header.overdueClientCount || 0;
  var avg = header.avgDaysOverdue || 0;
  var sep = ' \u00b7 ';
  return (
    total +
    ' outstanding' +
    sep +
    clients +
    ' client' +
    (clients === 1 ? '' : 's') +
    ' overdue' +
    sep +
    'avg ' +
    avg +
    ' days'
  );
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
  var invWord = cnt === 1 ? 'invoice' : 'invoices';
  return CardService.newDecoratedText()
    .setStartIcon(CardService.newIconImage().setIconUrl(dotUrl))
    .setText(label)
    .setBottomLabel(fmtMoneyCompact_(c.total) + ' \u00b7 ' + cnt + ' ' + invWord);
}

function appendInvoiceBlock_(section, row, withDivider) {
  if (withDivider) {
    section.addWidget(CardService.newDivider());
  }
  var dotUrl = severityDotUrl_(row.days_overdue);
  var d = Number(row.days_overdue) || 0;
  var daysText;
  if (d >= 90) {
    daysText = d + ' days overdue - urgent';
  } else if (d >= 60) {
    daysText = d + ' days overdue';
  } else if (d >= 30) {
    daysText = d + ' days overdue';
  } else {
    daysText = d + ' days';
  }
  var dueLine = formatDueDate_(row.due_date);
  var bottomLine = daysText;
  if (dueLine) {
    bottomLine = bottomLine + ' \u00b7 ' + dueLine;
  }
  section.addWidget(
    CardService.newDecoratedText()
      .setStartIcon(CardService.newIconImage().setIconUrl(dotUrl))
      .setTopLabel(row.client_name || 'Client')
      .setText(fmtMoney_(row.amount))
      .setBottomLabel(bottomLine)
  );
  // Show last reminder date inline if we have it.
  if (row.reminder_sent_at) {
    section.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Last reminder')
        .setText(String(row.reminder_sent_at).slice(0, 10))
    );
  }

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
          .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
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
var HOME_PACK_TTL_MS = 60 * 1000;

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

function readHomePackCache_() {
  try {
    var raw = PropertiesService.getUserProperties().getProperty(HOME_PACK_CACHE_KEY);
    if (!raw) return null;
    var entry = JSON.parse(raw);
    if (!entry || !entry.savedAt || !entry.data) return null;
    if (Date.now() - entry.savedAt > HOME_PACK_TTL_MS) return null;
    return entry.data;
  } catch (err) {
    return null;
  }
}

function writeHomePackCache_(data) {
  try {
    PropertiesService.getUserProperties().setProperty(
      HOME_PACK_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data: data })
    );
  } catch (err) {
    // Properties has size limits; on overflow just skip the cache.
  }
}

function clearHomePackCache_() {
  try {
    PropertiesService.getUserProperties().deleteProperty(HOME_PACK_CACHE_KEY);
  } catch (err) {
    // ignore
  }
}

function buildHomePage_(e) {
  var card = CardService.newCardBuilder();

  if (!getApiKey_() || !getApiBase_()) {
    return card
      .setHeader(CardService.newCardHeader().setTitle('Paid').setSubtitle('Connect to continue - v' + VERSION))
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

    card.setHeader(
      CardService.newCardHeader()
        .setTitle('Paid')
        .setSubtitle(formatHeaderLine_(header) + ' - v' + VERSION)
    );

    var cohortSec = CardService.newCardSection();
    cohortSec.setHeader('Outstanding by age');
    cohortSec.addWidget(buildCohortRow_(DOT_90, '90+ days', cohorts.d90));
    cohortSec.addWidget(buildCohortRow_(DOT_60, '60-90 days', cohorts.d60));
    cohortSec.addWidget(buildCohortRow_(DOT_30, '30-60 days', cohorts.d30));
    cohortSec.addWidget(buildCohortRow_(DOT_OK, 'Current', cohorts.current));
    card.addSection(cohortSec);

    var activitySec = buildActivitySectionFromPack_(data.activity);
    if (activitySec) card.addSection(activitySec);

    var remindersSec = buildRecentRemindersSectionFromPack_(data.recentReminders);
    if (remindersSec) card.addSection(remindersSec);

    var overdue = invoices.filter(function (r) {
      return (r.days_overdue || 0) >= 30;
    });

    var listSec = CardService.newCardSection();
    listSec.setHeader('Overdue invoices');
    if (!overdue.length) {
      listSec.addWidget(
        CardService.newDecoratedText()
          .setText('No invoices overdue 30+ days')
          .setBottomLabel('All invoices are current.')
      );
    } else {
      overdue.slice(0, 25).forEach(function (row, idx) {
        appendInvoiceBlock_(listSec, row, idx > 0);
      });
      if (overdue.length > 25) {
        listSec.addWidget(
          CardService.newTextParagraph().setText(
            'Plus ' +
              (overdue.length - 25) +
              ' more. Open paid-app.com to see all.'
          )
        );
      }
    }
    card.addSection(listSec);

    // Footer: just the bulk-review action. Developer plumbing (API base URL,
    // API key) lives behind the auth-failure recovery card now — customers
    // don't see a Settings button on the front of the sidebar.
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
        'Sign in at paid-app.com, then go to paid-app.com/api/auth/api-key to get your key.'
      )
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Open key page')
          .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          .setOpenLink(CardService.newOpenLink().setUrl('https://paid-app.com/api/auth/api-key'))
      )
    )
    .addWidget(CardService.newDivider())
    .addWidget(
      CardService.newTextInput()
        .setFieldName('api_base')
        .setTitle('API base URL')
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

function onReconnectFromError(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildSettingsCard_(e)))
    .build();
}

function buildContextualForMessage_(e) {
  if (!getApiKey_() || !getApiBase_()) {
    var c = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Paid'));
    c.addSection(buildSettingsSection_());
    return c.build();
  }

  var access = e.gmail && e.gmail.accessToken;
  var messageId = e.gmail && e.gmail.messageId;
  if (!access || !messageId) {
    return buildNotifyCard_(
      'Open a message to see Paid matches.',
      'onRefreshContextualMessage'
    );
  }

  var emails = extractEmailsFromMessage_(messageId, access);
  var fromEmail = extractFromEmail_(messageId, access);
  return buildCardsForEmails_(emails, 'onRefreshContextualMessage', {
    messageId: String(messageId),
    fromEmail: fromEmail,
    accessToken: access,
  });
}

function buildContextualForCompose_(e) {
  if (!getApiKey_() || !getApiBase_()) {
    var c = CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Paid'));
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
    return buildNotifyCard_(
      'Open a conversation with your client to see their invoices.',
      'onRefreshContextualCompose'
    );
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
  var builder = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle('Paid').setSubtitle('This contact')
  );

  // If this card is rendering for an OPEN message (not compose) and the message is
  // from one of the contact emails (i.e. a reply), classify automatically and
  // surface the result inline. Auto-classify is server-side dedup'd so we
  // don't burn an LLM call per render — see /api/replies/classify (auto:true).
  if (replyContext && replyContext.messageId && replyContext.fromEmail) {
    var prior = fetchPriorClassificationsForThread_(replyContext.messageId);

    // Cache miss: kick off auto-classification once. The result will appear on
    // next refresh of this card. (We can't synchronously read the message body
    // and classify here without making the open-thread render slow.)
    if ((!prior || prior.length === 0) && replyContext.accessToken) {
      try {
        var bodyText = fetchMessagePlainText_(replyContext.messageId, replyContext.accessToken);
        if (bodyText) {
          var autoRes = paidFetch_('/api/replies/classify', {
            method: 'post',
            payload: JSON.stringify({
              threadId: replyContext.messageId,
              clientEmail: replyContext.fromEmail,
              replyText: bodyText,
              auto: true,
            }),
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
      if (
        last.invoiceId &&
        (last.classification === 'cannot_pay' || last.classification === 'payment_plan_request')
      ) {
        classifySec.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText('Suggest payment plan')
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
            .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onClassifyReply')
                .setParameters({
                  messageId: replyContext.messageId,
                  fromEmail: replyContext.fromEmail,
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
                  fromEmail: replyContext.fromEmail,
                })
            )
        )
      );
    }
    builder.addSection(classifySec);
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
              .setBottomLabel(
                'Could not connect to Paid. Check your API key and try again.'
              )
          )
        );
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
    }
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
 * User-visible API failure copy (do not show raw HTTP status lines or response bodies).
 */
function userFacingApiError_(statusCode, body) {
  var c = Number(statusCode) || 0;
  if (c === 401 || c === 403) {
    return 'Could not connect to Paid. Check your API key and try again.';
  }
  if (c === 404) {
    return 'Could not connect to Paid. Check your API base URL and try again.';
  }
  return 'Could not connect to Paid. Check your API key and try again.';
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
    if (refreshApiKey_()) {
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

function maybeProactiveRefresh_() {
  var exp = getApiKeyExpiry_();
  if (!exp) return;
  var threeDays = 3 * 24 * 60 * 60 * 1000;
  if (Date.now() >= exp - threeDays) {
    refreshApiKey_();
  }
}

function buildReconnectCard_(message) {
  var card = CardService.newCardBuilder().setHeader(
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
  var card = CardService.newCardBuilder().setHeader(
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
  return trimSlash_(
    PropertiesService.getUserProperties().getProperty(PROP_API) || ''
  );
}

function getApiKey_() {
  return PropertiesService.getUserProperties().getProperty(PROP_API_KEY) || '';
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
  if (n === undefined || n === null) return '$0.00';
  var num = Number(n);
  if (isNaN(num)) return '$0.00';
  var fixed = num.toFixed(2);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
  var url =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' +
    encodeURIComponent(messageId) +
    '?format=metadata&metadataHeaders=From';
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
    timeout: 10000,
  });
  if (resp.getResponseCode() !== 200) return '';
  var json = JSON.parse(resp.getContentText());
  var headers = (json.payload && json.payload.headers) || [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h.name && h.name.toLowerCase() === 'from') {
      var emails = extractEmailsFromHeader_(h.value);
      if (emails && emails.length) return emails[0];
    }
  }
  return '';
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
  var card = CardService.newCardBuilder().setHeader(
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
