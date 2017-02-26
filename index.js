/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# SETUP THE APP on HEROKU:
  Create a Slack app. Make sure to configure the bot user!
    -> https://api.slack.com/applications/new
    -> Add the Redirect URI: https://${APP_NAME}.herokuapp.com/oauth
  Deply and run your app on Heroku.
    -> Add Config Vars on the Heroku app setting page: clientId, clientSecret
    -> Deploy and run on Heroku.
  Set RequestURL on Slack.
    -> Add the RequesteURL of Interactive Message: https://${APP_NAME}.herokuapp.com/slack/receive
# USE THE APP
  Add the app to your Slack by visiting the login page:
    -> https://${APP_NAME}.herokuapp.com/login
  After you've added the app, try talking to your bot!
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

var Botkit = require('botkit');
var MongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/oxo';

if (!process.env.clientId || !process.env.clientSecret || !process.env.port) {
  console.log('Error: Specify clientId clientSecret and port in environment');
  process.exit(1);
}

var controller = Botkit.slackbot({
  // interactive_replies: true, // tells botkit to send button clicks into conversations
  hostname: '0.0.0.0',
  storage: require('./lib/botkit-custom-mongo')({mongoUri: MongoUrl, collections: ['games', 'summaries']})
}).configureSlackApp(
  {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    scopes: ['bot','incoming-webhook','commands'],
  }
);

var ZangyoBot = require('./lib/bot')(controller);

controller.setupWebserver(process.env.port,function(err,webserver) {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
    if (err) {
      res.status(500).send('ERROR: ' + err);
    } else {
      res.send('Success!');
    }
  });
});

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}

controller.on('create_bot',function(bot,config) {
  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {
      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say('Konnichiwa!! I am Zangyobot that has just joined your team. :robot_face:');
          convo.say('Please /invite me to a channel so that I can be of use!');
        }
      });
    });
  }
});

// Handle events related to the websocket connection to Slack
controller.on('rtm_open',function(bot) {
  console.log('** The RTM api just connected!');
});

controller.on('rtm_close',function(bot) {
  console.log('** The RTM api just closed');
  // you may want to attempt to re-open
});

controller.hears('((?=.*waiting)(?=.*list)|.*(申請中|未承認).*一覧.*)',['direct_message','direct_mention','mention'],function(bot,message) {
  ZangyoBot.replyPendingList(bot, message);
});

/*---------- MAIN START ----------*/
controller.hears('challenge',['direct_message','direct_mention'],function(bot,message) {
  if (message.text.match(/^\//)) return; // Avoid slash_command

  console.log(message.text);
  if (!message.text.match(/\<\@[a-zA-Z0-9]+\>/g)) {
    bot.reply(message, 'Choose your opponent. :hankey:');
    return;
  }

  ZangyoBot.startGame(bot, message);
});

/**
 * ask: mark-[game_id]
 * ans: (cell/page)-[#]
 */
controller.on('interactive_message_callback', function(bot, message) {
  var ask = message.callback_id.split(/\-/);
  var ans = message.actions[0].name.split(/\-/);

  if (ask[0] === 'mark') {
    if (ans[0] === 'cell') {
      ZangyoBot.mark(bot, message, ask[1], ans[1]);
    } else if (ans[0] === 'page'){
      ZangyoBot.page(bot, message, ask[1], ans[1]);
    }
  }
});

controller.on('slash_command', function(bot, message) {
  switch (message.text.split(' ')[0]) {
    case 'challenge':
      var opponent;

      if (message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)) {
        opponent = message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)[0].slice(1);
      }

      if (!opponent) {
        bot.reply(message, 'Select your opponent. :hankey:');
        return;
      }

      bot.reply(message, 'abc');

      break;
    case 'help':
      var challenge_help = '`/ox challenge [@opponent]` starts a new game.';
      var rank_help = '`/ox rank` shows a list of top rankers of your team.';
      var help_message = 'Use `/ox` to play a game.\n Available commands are:'
        + '\n • ' + challenge_help + '\n • ' + rank_help;
      bot.replyPrivate(message, help_message);
      break;
    default:
      bot.replyPrivate(message, 'Illegal command!! :ghost:\n');
      break;
  }
});
/*---------- MAIN END ----------*/

controller.hears('((?=.*(zangyo|night|morning|holiday|application|applied))(?=.*list)|.*(残業|早朝|休日|申請).*一覧.*)',['direct_message','direct_mention','mention'],function(bot,message) {
  if (message.text.match(/^\//)) return; // Avoid slash_command

  var range, applicant, filter, period, is_detailed;

  range = findRange(message);
  if (!range) {
    bot.reply(message, 'Too big range!! Modify it to be smaller than monthly... :hankey:');
    return;
  }

  if (message.text.match(/\<\@[a-zA-Z0-9]+\>/g)) {
    applicant = message.text.match(/\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
  }

  filter = findFilter(message);

  period = findPeriod(message);

  is_detailed = message.text.match(/detail|details|詳細|詳しく/) != null;

  ZangyoBot.replyList(bot, message, range, applicant, filter, period, is_detailed);
});

function findRange(message) {
  var range;

  if (message.text.match(/today|tonight|今日|本日|今夜|今晩/)) {
    range = ZangyoBot.ranges.today;
  } else if (message.text.match(/day before yesterday|一昨日/)) {
    range = ZangyoBot.ranges.day_before_yesterday;
  } else if (message.text.match(/yesterday|last night|昨日|昨夜|昨晩/)) {
    range = ZangyoBot.ranges.yesterday;
  } else if (message.text.match(/this week|今週/)) {
    range = ZangyoBot.ranges.this_week;
  } else if (message.text.match(/week before last|先々週|先先週/)) {
    range = ZangyoBot.ranges.week_before_last;
  } else if (message.text.match(/last week|先週/)) {
    range = ZangyoBot.ranges.last_week;
  } else if (message.text.match(/past (one|1) week|過去(一|１|1)週間|ここ(一|１|1)週間/)) {
    range = ZangyoBot.ranges.past_one_week;
  } else if (message.text.match(/this month|今月/)) {
    range = ZangyoBot.ranges.this_month;
  } else if (message.text.match(/month before last|先々月|先先月/)) {
    range = ZangyoBot.ranges.month_before_last;
  } else if (message.text.match(/last month|先月/)) {
    range = ZangyoBot.ranges.last_month;
  } else if (message.text.match(/two days after tomorrow|2 days after tomorrow|明々後日/)) {
    range = ZangyoBot.ranges.two_days_after_tomorrow;
  } else if (message.text.match(/day after tomorrow|明後日/)) {
    range = ZangyoBot.ranges.day_after_tomorrow;
  } else if (message.text.match(/tomorrow|明日/)) {
    range = ZangyoBot.ranges.tomorrow;
  } else if (message.text.match(/week after next|再来週/)) {
    range = ZangyoBot.ranges.week_after_next;
  } else if (message.text.match(/next week|来週/)) {
    range = ZangyoBot.ranges.next_week;
  } else if (message.text.match(/month after next|再来月/)) {
    range = ZangyoBot.ranges.month_after_next;
  } else if (message.text.match(/next month|来月/)) {
    range = ZangyoBot.ranges.next_month;
  } else if (message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)) {
    range = message.text.match(/(1[0-2]|0?[1-9])\/(3[01]|[12][0-9]|0?[1-9])/g)[0];
  } else if (message.text.match(/(1[0-2]|0?[1-9])月(3[01]|[12][0-9]|0?[1-9])日/g)) {
    range = message.text.match(/(1[0-2]|0?[1-9])月(3[01]|[12][0-9]|0?[1-9])日/g)[0];
  } else if (message.text.match(/year before last|last year|this year|next year|year after next|一昨年|去年|今年|来年|再来年/)) {
    range = null;
  } else {
    range = ZangyoBot.ranges.today;
  }

  return range;
};

function findFilter(message) {
  var filter;

  if (message.text.match(/latest|最後|最終/)) {
    filter = ZangyoBot.filters.latest;
  } else if (message.text.match(/all|applied|application|全て|全部|申請/)) {
    filter = ZangyoBot.filters.applied;
  } else {
    filter = ZangyoBot.filters.approved;
  }

  return filter;
};

function findPeriod(message) {
  if (message.text.match(/morning|早朝/)) {
    return ZangyoBot.periods.morning;
  } else if (message.text.match(/night|zangyo|残業/)) {
    return ZangyoBot.periods.night;
  } else if (message.text.match(/holiday|休日/)) {
    return ZangyoBot.periods.holiday;
  } else {
    return null;
  }
};

controller.hears('(.*apply.*(overtime|zangyo).*|.*残業.*申請.*)',['direct_message','direct_mention'],function(bot,message) {
  ZangyoBot.zangyoWizard(bot, message);
});

controller.hears('(.*apply.*morning.*|.*朝.*(出勤|勤務).*申請.*)',['direct_message','direct_mention'],function(bot,message) {
  ZangyoBot.morningWorkWizard(bot, message);
});

controller.hears('(.*apply.*holiday.*|.*(休日|土曜|日曜|祝日).*(出勤|勤務).*申請.*)',['direct_message','direct_mention'],function(bot,message) {
  ZangyoBot.holidayWorkWizard(bot, message);
});

controller.hears('(.*apply.*(unapplied|past).*|.*事後.*申請.*)',['direct_message','direct_mention'],function(bot,message) {
  ZangyoBot.delayApply(bot, message);
});

controller.hears('test', ['direct_message'],function(bot,message) {
  var reply = {
    "text": "ボタンのテストです。",
    "attachments": [{
      "text": "どれか押してください。\n 改行したかい？",
      "author_name": "<@" + message.user + ">",
      "fallback": "失敗しました。",
      "callback_id": "test_button",
      "color": "#808080",
      "mrkdwn_in": ["fields"],
      "fields": [
        {
          "title": "<@" + message.user + "> まで、以下の理由により",
          "value": "*<@" + message.user+ "> ヴァリュー* ですよー",
          "short": false
        }
      ],
      "actions": [
        {
          "type": "button",
          "name": "test_button1",
          "text": "テストボタン1"
        },
        {
          "type": "button",
          "name": "test_button2",
          "text": "テストボタン2"
        }
      ]
    }]
  };
  bot.reply(message, reply);
});

controller.on('interactive_message_callback', function(bot, message) {
  var ids = message.callback_id.split(/\-/);
  var action = ids[0];
  var item_id = ids[1];
  var ans = message.actions[0].name;

  if (action == 'delay_apply') {
    if (ans == 'night') {
      ZangyoBot.zangyoWizardDelay(bot, message);
    } else if (ans == 'morning') {
      ZangyoBot.morningWorkWizardDelay(bot, message);
    } else if (ans == 'holiday') {
      ZangyoBot.holidayWorkWizardDelay(bot, message);
    }
  } else if (action == 'apply') {
    if (ans == 'apply') {
      ZangyoBot.apply(item_id, bot, message);
    } else if (ans == 'redo') {
      ZangyoBot.redoApply(item_id, bot, message);
    } else if (ans == 'cancel') {
      ZangyoBot.cancelApply(item_id, bot, message);
    }
  } else if (action == 'approve') {
    if (ans == 'approve') {
      ZangyoBot.approve(item_id, bot, message);
    } else if (ans == 'reject') {
      ZangyoBot.rejectApprove(item_id, bot, message);
    } else if (ans == 'reject-comment') {
      ZangyoBot.rejectCommentApprove(item_id, bot, message);
    }
  }
});

controller.on('slash_command', function(bot, message) {
  var list_help = '`/zangyo list [today/yesterday/this week] [@xxxxx] [applied] [detail]`';
  var apply_help = '`/zangyo apply @approver HH:MM \'reason\'`';
  var help_message = 'Use `/zangyo` to apply and browse zangyos for your team.\n Available commands are:\n • ' + apply_help + '\n • ' + list_help;

  switch (message.text.split(' ')[0]) {
    case 'list':
      var range, applicant, filter, period, is_detailed;

      if (message.text.match(/help/g)) {
        bot.replyPrivate(message, list_help);
        return;
      }

      range = findRange(message);
      if (!range) {
        bot.reply(message, 'Too big range!! Modify it to be smaller than monthly... :hankey:');
        return;
      }

      if (message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)) {
        applicant = message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)[0].slice(1);
      }

      filter = findFilter(message);

      period = findPeriod(message);

      is_detailed = message.text.match(/(detail|details)/) != null;

      message.team = message.team_id;
      message.user = message.user_id;

      if (applicant) {
        ZangyoBot.replyListByName(bot, message, range, applicant, filter, period, is_detailed);
      } else {
        ZangyoBot.replyList(bot, message, range, null, filter, period, is_detailed);
      }
      break;
    case 'apply':
      var approver, end_time, reason;

      if (message.text.match(/help/g)) {
        bot.replyPrivate(message, apply_help);
        return;
      }

      if (message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)) {
        approver = message.text.match(/\@[a-zA-Z0-9\.\-\_]+/g)[0].slice(1);
      }

      if (message.text.match(/([0-2]?[0-9]):([0-5]?[0-9])/g)) {
        end_time = message.text.match(/([0-2]?[0-9]):([0-5]?[0-9])/g)[0];
      }

      if (message.text.match(/\'.+\'/g)) {
        reason = message.text.match(/\'.+\'/g)[0].slice(1,-1);
      } else if (message.text.match(/\".+\"/g)) {
        reason = message.text.match(/\".+\"/g)[0].slice(1,-1);
      } else if (message.text.match(/\「.+\」/g)) {
        reason = message.text.match(/\「.+\」/g)[0].slice(1,-1);
      }

      if (!approver || !end_time || !reason) {
        bot.replyPrivate(message, 'The format must be ' + apply_help);
        return;
      }

      ZangyoBot.createApplication(bot, message, approver, end_time, reason);
      break;
    case 'help':
      bot.replyPrivate(message, help_message);
      break;
    default:
      bot.replyPrivate(message, 'Illegal command!! :ghost:\n' + help_message);
      break;
  }
});

controller.storage.teams.all(function(err,teams) {
  if (err) {
    throw new Error(err);
  }

  // connect all teams with bots up to slack!
  for (var t  in teams) {
    if (teams[t].bot) {
      controller.spawn(teams[t]).startRTM(function(err, bot) {
        if (err) {
          console.log('Error connecting bot to Slack:',err);
        } else {
          trackBot(bot);
        }
      });
    }
  }
});
