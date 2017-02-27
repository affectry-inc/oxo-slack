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
    scopes: ['bot','commands'],
  }
);

var SlackBot = require('./lib/slack_bot')(controller);

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
          convo.say('Konnichiwa!! I am oxobot that has just joined your team. :robot_face:');
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

controller.hears('(challenge|beat)',['direct_message','direct_mention'],function(bot,message) {
  if (message.text.match(/^\//)) return; // Avoid slash_command

  if (message.text.match(/\s+(me)\s*$/)) {
    message.text += ' <@' + message.user + '>';
  } else if (!message.text.match(/\<\@[a-zA-Z0-9]+(\||\>)/g)) {
    bot.reply(message, 'Choose your opponent. :hankey:');
    return;
  }

  SlackBot.startGame(bot, message);
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
      SlackBot.mark(bot, message, ask[1], ans[1]);
    } else if (ans[0] === 'page'){
      SlackBot.page(bot, message, ask[1], (ans[1] * 1));
    }
  }
});

controller.on('slash_command', function(bot, message) {
  switch (message.text.split(' ')[0]) {
    case 'challenge':
      if (message.text.match(/\s+(me)\s*$/)) {
        message.text += ' <@' + message.user + '>';
      } else if (!message.text.match(/\<\@[a-zA-Z0-9]+(\||\>)/g)) {
        bot.reply(message, 'Choose your opponent. :hankey:');
        return;
      }

      SlackBot.startGame(bot, message);
      break;
    case 'help':
      var challenge_help = '`/oxo challenge [@opponent]` starts a new game.';
      var beat_help = '`/oxo beat [@opponent]` starts a new game also.';
      var rank_help = '`/oxo rankers` shows a list of top rankers of your team.';
      var help_message = 'Use `/oxo` to play a game.\n Available commands are:'
        + '\n • ' + challenge_help + '\n • ' + beat_help + '\n • ' + rank_help;
      bot.replyPrivate(message, help_message);
      break;
    default:
      bot.replyPrivate(message, 'Illegal command!! :ghost:\n');
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
