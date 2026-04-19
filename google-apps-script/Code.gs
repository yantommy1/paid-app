/**
 * Paid — Gmail Workspace Add-On (Google Apps Script)
 *
 * Configure in Script properties (Project Settings):
 *   PAID_API_BASE  e.g. https://getpaid.ai
 *   PAID_API_KEY   Long-lived key from POST /api/auth/api-key (browser, logged in) — see onboarding
 *
 * Or use the “Connect Paid” card on first load to paste both values.
 *
 * “Open in Gmail” uses CardService compose actions (scope gmail.addons.current.action.compose)
 * to open a normal compose window prefilled via GmailApp.createDraft.
 */

var PROP_API = 'PAID_API_BASE';
var PROP_API_KEY = 'PAID_API_KEY';

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
  if (apiKey) PropertiesService.getUserProperties().setProperty(PROP_API_KEY, apiKey.trim());
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

/** Clears PAID_API_BASE and PAID_API_KEY user properties. Run manually from the script editor (Run → clearPaidSettings) to reset stored credentials. */
function clearPaidSettings() {
  var p = PropertiesService.getUserProperties();
  p.deleteProperty(PROP_API);
  p.deleteProperty(PROP_API_KEY);
}

/**
 * Step 1 — fetch AI draft from the backend and show preview (Send Now / Open in Gmail).
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
    var res = paidFetch_('/api/invoices/draft-reminder', {
      method: 'post',
      payload: JSON.stringify({ invoiceId: id }),
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(
          CardService.newNotification().setText('Draft failed: ' + res.body)
        )
        .build();
    }
    var data = JSON.parse(res.body);
    var subject = data.subject || '';
    var body = data.body || '';
    cacheReminderDraft_(id, clientEmail, subject, body);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(String(err)))
      .build();
  }
}

/**
 * Open preview for a reminder already cached (e.g. 30+ day review queue after “Send all”).
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
          'Draft not found. Run “Send all reminders” again from the home card.'
        )
      )
      .build();
  }
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
    .build();
}

/**
 * Step 2 — send the cached draft via backend (Gmail on server).
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
      clearReminderDraft_(id);
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('Reminder sent.'))
        .setNavigation(CardService.newNavigation().popCard())
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText('Send failed: ' + res.body)
      )
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(String(err)))
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
          CardService.newNotification().setText('Queue failed: ' + res.body)
        )
        .build();
    }
    var data = JSON.parse(res.body);
    var queue = data.queue || [];
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildReviewQueueCard_(queue)))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(String(err)))
      .build();
  }
}

function reminderDraftKey_(invoiceId) {
  return 'paid_reminder_draft_' + String(invoiceId);
}

function cacheReminderDraft_(invoiceId, clientEmail, subject, body) {
  PropertiesService.getUserProperties().setProperty(
    reminderDraftKey_(invoiceId),
    JSON.stringify({
      clientEmail: clientEmail || '',
      subject: subject || '',
      body: body || '',
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
  return s.substring(0, maxLen) + '\n…';
}

/**
 * Native Gmail compose (standalone draft) — uses scope gmail.addons.current.action.compose.
 * Data comes from the cached reminder draft for this invoice.
 */
function onOpenPaidCompose(e) {
  if (e.gmail && e.gmail.accessToken) {
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  }
  var id = e.parameters && e.parameters.invoiceId;
  var cached = id ? loadReminderDraft_(id) : null;
  var to = (cached && cached.clientEmail) || '';
  var subj = (cached && cached.subject) || '';
  var body = (cached && cached.body) || '';
  if (!cached) {
    subj = 'Paid — draft unavailable';
    body = 'Return to the Paid add-on and generate the draft again.';
  }
  var gmailDraft = GmailApp.createDraft(to, subj, body);
  return CardService.newComposeActionResponseBuilder().setGmailDraft(gmailDraft).build();
}

function buildDraftPreviewCard_(invoiceId) {
  var draft = loadReminderDraft_(invoiceId);
  var subj = draft && draft.subject ? draft.subject : '';
  var body = draft && draft.body ? draft.body : '';

  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('Review draft')
      .setSubtitle('Edit in Gmail or send from here')
  );

  card.addSection(
    CardService.newCardSection()
      .setHeader('Subject')
      .addWidget(CardService.newTextParagraph().setText(subj || '(empty)'))
  );
  card.addSection(
    CardService.newCardSection()
      .setHeader('Body')
      .addWidget(CardService.newTextParagraph().setText(truncateForCard_(body, 4000)))
  );

  card.addSection(
    CardService.newCardSection().addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText('Open in Gmail')
            .setComposeAction(
              CardService.newAction()
                .setFunctionName('onOpenPaidCompose')
                .setParameters({ invoiceId: String(invoiceId) }),
              CardService.ComposedEmailType.STANDALONE_DRAFT
            )
        )
        .addButton(
          CardService.newTextButton()
            .setText('Send Now')
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onSendReminder')
                .setParameters({ invoiceId: String(invoiceId) })
            )
        )
    )
  );

  return card.build();
}

// --- UI builders ---

function buildHomePage_(e) {
  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle('Paid').setSubtitle('Outstanding invoices')
  );

  if (!getApiKey_() || !getApiBase_()) {
    return card.addSection(buildSettingsSection_()).build();
  }

  try {
    var sum = paidFetch_('/api/invoices/summary', { method: 'get' });
    var inv = paidFetch_('/api/invoices', { method: 'get' });
    if (sum.statusCode !== 200 || inv.statusCode !== 200) {
      return card
        .addSection(
          CardService.newCardSection().addWidget(
            CardService.newTextParagraph().setText(
              'Could not load data. Check API key and API base. ' + sum.body
            )
          )
        )
        .build();
    }
    var summary = JSON.parse(sum.body);
    var list = JSON.parse(inv.body);
    var cohorts = summary.cohorts || {};

    card.addSection(
      CardService.newCardSection()
        .setHeader('Totals by age')
        .addWidget(
          CardService.newTextParagraph().setText(
            '🟢 Current: ' +
              fmtMoney_(cohorts.current && cohorts.current.total) +
              ' (' +
              n_(cohorts.current && cohorts.current.count) +
              ')\n' +
              '🟡 30–60d: ' +
              fmtMoney_(cohorts.d30 && cohorts.d30.total) +
              ' (' +
              n_(cohorts.d30 && cohorts.d30.count) +
              ')\n' +
              '🟠 60–90d: ' +
              fmtMoney_(cohorts.d60 && cohorts.d60.total) +
              ' (' +
              n_(cohorts.d60 && cohorts.d60.count) +
              ')\n' +
              '🔴 90+d: ' +
              fmtMoney_(cohorts.d90 && cohorts.d90.total) +
              ' (' +
              n_(cohorts.d90 && cohorts.d90.count) +
              ')'
          )
        )
    );

    var invoices = list.invoices || [];
    var section = CardService.newCardSection().setHeader('All open invoices');
    if (!invoices.length) {
      section.addWidget(CardService.newTextParagraph().setText('No unpaid invoices.'));
    } else {
      invoices.slice(0, 20).forEach(function (row) {
        section.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText(row.client_name + ' · ' + fmtMoney_(row.amount) + ' · ' + row.days_overdue + 'd')
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('onDraftReminder')
                  .setParameters({
                    invoiceId: String(row.id),
                    clientEmail: String(row.client_email || ''),
                  })
              )
              .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
          )
        );
        section.addWidget(
          CardService.newTextParagraph().setText(
            severityLabel_(row.days_overdue) + ' Inv #' + row.quickbooks_invoice_id
          )
        );
      });
      if (invoices.length > 20) {
        section.addWidget(
          CardService.newTextParagraph().setText('…and ' + (invoices.length - 20) + ' more in the web app.')
        );
      }
    }
    card.addSection(section);

    card
      .addSection(
        CardService.newCardSection()
          .addWidget(
            CardService.newButtonSet()
              .addButton(
                CardService.newTextButton()
                  .setText('Send all reminders (30d+)')
                  .setOnClickAction(
                    CardService.newAction().setFunctionName('onQueueAllReminders')
                  )
              )
              .addButton(
                CardService.newTextButton()
                  .setText('Get API key')
                  .setOpenLink(
                    CardService.newOpenLink().setUrl(
                      getApiBase_() + '/api/auth/api-key?format=plain'
                    )
                  )
              )
          )
      )
      .addCardAction(
        CardService.newCardAction()
          .setText('Refresh')
          .setOnClickAction(CardService.newAction().setFunctionName('onRefreshHome'))
      );

    return card.build();
  } catch (err) {
    return card
      .addSection(
        CardService.newCardSection().addWidget(
          CardService.newTextParagraph().setText('Error: ' + String(err))
        )
      )
      .build();
  }
}

function onRefreshHome(e) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

function buildSettingsSection_() {
  return CardService.newCardSection()
    .setHeader('Connect Paid')
    .addWidget(
      CardService.newTextParagraph().setText(
        'Paste your API base (e.g. https://getpaid.ai) and Paid API key (generate in the web app after signing in).'
      )
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('api_base')
        .setTitle('API base URL')
        .setHint('https://getpaid.ai')
    )
    .addWidget(
      CardService.newTextInput().setFieldName('api_key').setTitle('Paid API key (Bearer)')
    )
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Save')
          .setOnClickAction(CardService.newAction().setFunctionName('onSavePaidSettings'))
      )
    );
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
    return buildNotifyCard_('Open a message to see Paid matches.');
  }

  var emails = extractEmailsFromMessage_(messageId, access);
  return buildCardsForEmails_(emails);
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
  if (!emails.length) return buildNotifyCard_('Add a recipient to see Paid matches.');

  return buildCardsForEmails_(emails);
}

function buildCardsForEmails_(emails) {
  var builder = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle('Paid').setSubtitle('Matches for this thread')
  );

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    try {
      var res = paidFetch_(
        '/api/invoices/by-contact?email=' + encodeURIComponent(email),
        { method: 'get' }
      );
      if (res.statusCode !== 200) {
        builder.addSection(
          CardService.newCardSection()
            .setHeader(email)
            .addWidget(
              CardService.newTextParagraph().setText(
                'Could not load invoices (' + res.statusCode + ').'
              )
            )
        );
        continue;
      }
      var data = JSON.parse(res.body);
      var rows = data.invoices || [];
      if (!rows.length) {
        builder.addSection(
          CardService.newCardSection()
            .setHeader(email)
            .addWidget(CardService.newTextParagraph().setText('No open invoices for this address.'))
        );
        continue;
      }
      var sec = CardService.newCardSection().setHeader(email + ' · ' + rows.length + ' open');
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        sec.addWidget(
          CardService.newTextParagraph().setText(
            severityLabel_(row.days_overdue) +
              ' ' +
              row.client_name +
              ' · #' +
              row.quickbooks_invoice_id +
              ' · ' +
              fmtMoney_(row.amount) +
              ' · ' +
              row.days_overdue +
              'd late'
          )
        );
        sec.addWidget(
          CardService.newButtonSet().addButton(
            CardService.newTextButton()
              .setText('Send reminder')
              .setOnClickAction(
                CardService.newAction()
                  .setFunctionName('onDraftReminder')
                  .setParameters({
                    invoiceId: String(row.id),
                    clientEmail: String(row.client_email || ''),
                  })
              )
          )
        );
      }
      builder.addSection(sec);
    } catch (err) {
      builder.addSection(
        CardService.newCardSection().addWidget(
          CardService.newTextParagraph().setText('Error for ' + email + ': ' + String(err))
        )
      );
    }
  }

  return builder.build();
}

function buildReviewQueueCard_(queue) {
  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader()
      .setTitle('Review reminders')
      .setSubtitle('Preview each draft before sending')
  );
  if (!queue.length) {
    card.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText('Nothing in the 30+ day queue.')
      )
    );
    return card.build();
  }

  queue.forEach(function (item, i) {
    cacheReminderDraft_(item.invoiceId, item.clientEmail, item.subject, item.body);
    var sec = CardService.newCardSection().setHeader(
      '#' + (i + 1) + ' ' + item.clientName + ' · ' + item.daysOverdue + 'd'
    );
    sec.addWidget(CardService.newTextParagraph().setText(item.subject));
    sec.addWidget(
      CardService.newTextParagraph().setText(item.body.length > 400 ? item.body.substring(0, 400) + '…' : item.body)
    );
    sec.addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Review & send')
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

function buildNotifyCard_(text) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Paid'))
    .addSection(
      CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(text))
    )
    .build();
}

// --- HTTP + helpers ---

function paidFetch_(path, opts) {
  var base = getApiBase_();
  var apiKey = getApiKey_();
  if (!base || !apiKey) throw new Error('Configure PAID_API_BASE and PAID_API_KEY');

  var url = base + path;
  var params = {
    method: opts.method || 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
  };
  if (opts.payload) params.payload = opts.payload;
  var resp = UrlFetchApp.fetch(url, params);
  return {
    statusCode: resp.getResponseCode(),
    body: resp.getContentText(),
  };
}

function getApiBase_() {
  return trimSlash_(
    PropertiesService.getUserProperties().getProperty(PROP_API) || ''
  );
}

function getApiKey_() {
  return PropertiesService.getUserProperties().getProperty(PROP_API_KEY) || '';
}

function trimSlash_(s) {
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function fmtMoney_(n) {
  if (n === undefined || n === null) return '$0';
  return '$' + Number(n).toFixed(2);
}

function n_(x) {
  return x === undefined || x === null ? 0 : x;
}

function severityLabel_(days) {
  if (days >= 90) return '🔴';
  if (days >= 60) return '🟠';
  if (days >= 30) return '🟡';
  return '🟢';
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
