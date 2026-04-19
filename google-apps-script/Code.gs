/**
 * Paid — Gmail Workspace Add-On (Google Apps Script)
 *
 * Configure in Script properties (Project Settings):
 *   PAID_API_BASE  e.g. https://getpaid.ai
 *   PAID_JWT       Supabase access token from GET /api/auth/session-token (browser, logged in)
 *
 * Or use the “Connect Paid” card on first load to paste both values.
 */

var PROP_API = 'PAID_API_BASE';
var PROP_JWT = 'PAID_JWT';

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

/** Save config form (API base + JWT). */
function onSavePaidSettings(e) {
  var form =
    e.formInputs || (e.commonEventObject && e.commonEventObject.formInputs) || {};
  var base = getFormText_(form, 'api_base');
  var jwt = getFormText_(form, 'jwt');
  if (base) PropertiesService.getUserProperties().setProperty(PROP_API, trimSlash_(base));
  if (jwt) PropertiesService.getUserProperties().setProperty(PROP_JWT, jwt.trim());
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

/** Send one reminder via backend (uses stored Gmail refresh on server). */
function onSendReminder(e) {
  var id = e.parameters && e.parameters.invoiceId;
  if (!id) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Missing invoice id'))
      .build();
  }

  try {
    var res = paidFetch_('/api/invoices/send-reminder', {
      method: 'post',
      payload: JSON.stringify({ invoiceId: id, channel: 'addon' }),
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('Reminder sent.'))
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

/** Send reminder for one item from the review queue (server drafts already stored). */
function onSendFromReview(e) {
  return onSendReminder(e);
}

// --- UI builders ---

function buildHomePage_(e) {
  var card = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle('Paid').setSubtitle('Outstanding invoices')
  );

  if (!getJwt_() || !getApiBase_()) {
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
              'Could not load data. Check token and API base. ' + sum.body
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
                CardService.newAction().setFunctionName('onSendReminder').setParameters({
                  invoiceId: String(row.id),
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
                  .setText('Reconnect / token')
                  .setOpenLink(CardService.newOpenLink().setUrl(getApiBase_() + '/api/auth/session-token'))
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
        'Paste your API base (e.g. https://getpaid.ai) and Supabase JWT from your browser after signing in.'
      )
    )
    .addWidget(
      CardService.newTextInput()
        .setFieldName('api_base')
        .setTitle('API base URL')
        .setHint('https://getpaid.ai')
    )
    .addWidget(CardService.newTextInput().setFieldName('jwt').setTitle('Bearer token (JWT)'))
    .addWidget(
      CardService.newButtonSet().addButton(
        CardService.newTextButton()
          .setText('Save')
          .setOnClickAction(CardService.newAction().setFunctionName('onSavePaidSettings'))
      )
    );
}

function buildContextualForMessage_(e) {
  if (!getJwt_() || !getApiBase_()) {
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
  if (!getJwt_() || !getApiBase_()) {
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
                  .setFunctionName('onSendReminder')
                  .setParameters({ invoiceId: String(row.id) })
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
    CardService.newCardHeader().setTitle('Review reminders').setSubtitle('Approve each send')
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
          .setText('Send this one')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('onSendReminder')
              .setParameters({ invoiceId: item.invoiceId })
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
  var jwt = getJwt_();
  if (!base || !jwt) throw new Error('Configure PAID_API_BASE and PAID_JWT');

  var url = base + path;
  var params = {
    method: opts.method || 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + jwt },
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

function getJwt_() {
  return PropertiesService.getUserProperties().getProperty(PROP_JWT) || '';
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
