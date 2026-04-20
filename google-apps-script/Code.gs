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
var PAID_VERSION = '1.0.0';

var PROP_API = 'PAID_API_BASE';
var PROP_API_KEY = 'PAID_API_KEY';

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
  if (apiKey) PropertiesService.getUserProperties().setProperty(PROP_API_KEY, apiKey.trim());
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildHomePage_(e)))
    .build();
}

/** Clears PAID_API_BASE and PAID_API_KEY user properties. Run manually from the script editor (Run > clearPaidSettings) to reset stored credentials. */
function clearPaidSettings() {
  var p = PropertiesService.getUserProperties();
  p.deleteProperty(PROP_API);
  p.deleteProperty(PROP_API_KEY);
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
    var res = paidFetch_('/api/invoices/draft-reminder', {
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
    var subject = data.subject || '';
    var body = data.body || '';
    cacheReminderDraft_(id, clientEmail, subject, body);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(buildDraftPreviewCard_(String(id))))
      .setNotification(CardService.newNotification().setText('Reminder drafted. Review below.'))
      .build();
  } catch (err) {
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
      clearReminderDraft_(id);
      return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('Reminder sent.'))
        .setNavigation(CardService.newNavigation().popCard())
        .build();
    }
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(userFacingApiError_(res.statusCode, res.body))
      )
      .build();
  } catch (err) {
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
    return CardService.newComposeActionResponseBuilder().setGmailDraft(gmailDraft).build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(
        CardService.newNotification().setText(
          'Edit in Gmail is only available on desktop. Use Send Now instead.'
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
        'Edit in Gmail is only available on desktop. Use Send Now instead.'
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

  var btnRow = CardService.newButtonSet().addButton(
    CardService.newTextButton()
      .setText('Send Now')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('onSendReminder')
          .setParameters({ invoiceId: String(invoiceId) })
      )
  );
  try {
    btnRow.addButton(
      CardService.newTextButton()
        .setText('Edit in Gmail')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
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
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
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
  section.addWidget(
    CardService.newButtonSet().addButton(
      CardService.newTextButton()
        .setText('Draft reminder')
        .setTextButtonStyle(CardService.TextButtonStyle.OUTLINED)
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

// --- UI builders ---

/**
 * Single GET to gmail-sidebar when deployed; if that route returns 404 (older deploy),
 * merge GET /api/invoices/summary + GET /api/invoices (same shape as gmail-sidebar).
 */
function fetchGmailSidebarPack_() {
  var primary = paidFetch_('/api/invoices/gmail-sidebar', { method: 'get' });
  if (primary.statusCode === 200) {
    return { ok: true, data: JSON.parse(primary.body) };
  }
  if (primary.statusCode === 404) {
    var sum = paidFetch_('/api/invoices/summary', { method: 'get' });
    var inv = paidFetch_('/api/invoices', { method: 'get' });
    if (sum.statusCode !== 200) {
      return { ok: false, statusCode: sum.statusCode, body: sum.body };
    }
    if (inv.statusCode !== 200) {
      return { ok: false, statusCode: inv.statusCode, body: inv.body };
    }
    var s = JSON.parse(sum.body);
    var i = JSON.parse(inv.body);
    return {
      ok: true,
      data: {
        cohorts: s.cohorts || {},
        header: s.header || {},
        invoices: i.invoices || [],
      },
    };
  }
  return { ok: false, statusCode: primary.statusCode, body: primary.body };
}

function buildHomePage_(e) {
  var card = CardService.newCardBuilder();

  if (!getApiKey_() || !getApiBase_()) {
    return card
      .setHeader(CardService.newCardHeader().setTitle('Paid').setSubtitle('Connect to continue'))
      .addSection(buildSettingsSection_())
      .build();
  }

  try {
    var pack = fetchGmailSidebarPack_();
    if (!pack.ok) {
      return buildNotifyCard_(
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
        .setSubtitle(formatHeaderLine_(header))
    );

    var cohortSec = CardService.newCardSection();
    cohortSec.setHeader('Outstanding by age');
    cohortSec.addWidget(buildCohortRow_(DOT_90, '90+ days', cohorts.d90));
    cohortSec.addWidget(buildCohortRow_(DOT_60, '60-90 days', cohorts.d60));
    cohortSec.addWidget(buildCohortRow_(DOT_30, '30-60 days', cohorts.d30));
    cohortSec.addWidget(buildCohortRow_(DOT_OK, 'Current', cohorts.current));
    card.addSection(cohortSec);

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

    var foot = CardService.newCardSection();
    foot.addWidget(
      CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText('Send all reminders')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setOnClickAction(CardService.newAction().setFunctionName('onQueueAllReminders'))
        )
        .addButton(
          CardService.newTextButton()
            .setText('Settings')
            .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
            .setOnClickAction(CardService.newAction().setFunctionName('onOpenSettings'))
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
    return buildNotifyCard_(
      'Could not load Paid. Try again in a moment.',
      'onRefreshHome'
    );
  }
}

function onRefreshHome(e) {
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
    .setHeader(CardService.newCardHeader().setTitle('Paid').setSubtitle('Connection'))
    .addSection(buildSettingsSection_())
    .addCardAction(
      CardService.newCardAction()
        .setText('Back to invoices')
        .setOnClickAction(CardService.newAction().setFunctionName('onBackHome'))
    )
    .build();
}

function buildSettingsSection_() {
  return CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        'Sign in at paid-app.com, then go to paid-app.com/api/auth/api-key to get your key.'
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
  return buildCardsForEmails_(emails, 'onRefreshContextualMessage');
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

function buildCardsForEmails_(emails, contextualRefreshFn) {
  try {
  var builder = CardService.newCardBuilder().setHeader(
    CardService.newCardHeader().setTitle('Paid').setSubtitle('Invoices for this contact')
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
      var rows = data.invoices || [];
      var overdue = rows.filter(function (r) {
        return (r.days_overdue || 0) >= 30;
      });

      if (!rows.length) {
        builder.addSection(
          CardService.newCardSection().addWidget(
            CardService.newDecoratedText()
              .setText(email)
              .setBottomLabel('No open invoices')
          )
        );
        continue;
      }

      if (!overdue.length) {
        builder.addSection(
          CardService.newCardSection().addWidget(
            CardService.newDecoratedText()
              .setText(email)
              .setBottomLabel('No overdue invoices (30d+)')
          )
        );
        continue;
      }

      var totalOverdueAmt = sumAmount_(overdue);
      var clientLabel =
        (overdue[0] &&
          overdue[0].client_name &&
          String(overdue[0].client_name).trim()) ||
        email;
      var sec = CardService.newCardSection();
      sec.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(email)
          .setText(fmtMoney_(totalOverdueAmt))
          .setBottomLabel(
            clientLabel + ' \u00b7 ' + overdue.length + ' invoices'
          )
      );
      overdue.forEach(function (row, idx) {
        appendInvoiceBlock_(sec, row, idx > 0);
      });
      builder.addSection(sec);
    } catch (err) {
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
    cacheReminderDraft_(item.invoiceId, item.clientEmail, item.subject, item.body);
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

function paidFetch_(path, opts) {
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
