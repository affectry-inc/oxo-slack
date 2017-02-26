'use strict';

var moment = require('moment-timezone');
var luid = require('./utils').luid;
var callAPI = require('./utils').callAPI;
var isValidDate = require('./utils').isValidDate;

function ZangyoBot(controller) {
  var zangyo_bot = {};

  function getCells(cells_j) {
    // var cells = '|  `1`  |  `2`  |  X   |\n'
    //           + '|  X   |  `5`  |  `6`  |\n'
    //           + '|  O   |  O   |  X   |\n';
    // var cells_j = {'3': 'X', '4': 'X', '7': 'O', '8': 'O', '9': 'X'};
    var cells = '';

    for (var i = 1; i < 10; i++) {
      if (cells_j[i]) {
        var cell = '  ' + cells_j[i]+ '   ';
      } else {
        var cell = '  `' + i + '`  ';
      }
      cells += '|' + cell;
      if ([3, 6, 9].indexOf(i) > -1) {
        cells += '|\n';
      }
    }
    return cells;
  };

  /*
   * cells_j: JSON formatted cell vals
   * page: page for action buttons [1-3]
   */
  function getActions(cells_j, page) {
    var actions = [];
    var cnt = 9 - Object.keys(cells_j).length;
    var need_next = (page === 1 && cnt > 5) || (page === 2 && cnt > 8 );
    var from = page === 1 ? 1 : (3 * page - 1)
    var j = 0; // j: count of actual created buttons.
    var k = 0; // k: count of required number buttons.(no matter created or not)

    if (page > 1) {
      actions.push({
        'type': 'button',
        'name': 'page-' + (page - 1),
        'text': '<'
      })
      j++;
    }
    for (var i = 1; i < 10 && j < 5; i++) {
      if (j === 4 && need_next) {
        actions.push({
          'type': 'button',
          'name': 'page-' + (page + 1),
          'text': '>'
        })
        break;
      } else if (!cells_j[i]) {
        k++;
        if (k >= from) {
          actions.push({
            'type': 'button',
            'name': 'cell-' + i,
            'text': i + ''
          })
          j++;
        }
      }
    }
    return actions;
  };

  function getGameBoard(game, page) {
    var text, current_mark;

    if (game.last_marker) {
      text = '<@' + game.last_marker + '> marked cell #' + game.last_cell+ '.';
    } else {
      text = 'Get ready to beat <@' + game.player_2 + '>!!';
    }
    current_mark = game.current_turn === 1 ? 'O' : 'X';
    var reply = {
      'text': text,
      'attachments': [{
        'title': 'Now it\'s your turn. You are \'' + current_mark + '\'.',
        'text': getCells(game.cells),
        'fallback': 'Your turn comes!!',
        'callback_id': 'mark-' + game.id,
        'color': '#808080',
        'mrkdwn_in': ['text'],
        'fields': [
          {
            'title': 'Select a cell # from buttons below.'
          }
        ],
        'actions': getActions(game.cells, page)
      }]
    };
    return reply;
  };

  function getCurrentBoard(game, user_id) {
    var text, title, fallback;
    if (game.winner) {
      text = '<@' + game.player_1 + '> VS <@' + game.player_2 + '>';
      if (game.winner === 'DRAW') {
        title = 'DRAW GAME!!';
      } else if (user_id === game['player_' + winner]) {
        title = 'Congratulations!! You win!!';
      } else if (user_id === game.player_1 || user_id === game.player_2) {
        title = 'Ooops!! You lose!!';
      } else {
        title = ' <@' + game['player_' + winner] + '> won!';
      }
      fallback = '<@' + game.player_1 + '> VS <@' + game.player_2 + '>';
    } else {
      var turn = game['player_' + game.current_turn];
      text = '<@' + game.last_marker + '> marked cell #' + game.last_cell+ '.';
      title = 'Now <@' + turn + '> is thinking... :thinking_face:';
      fallback = '<@' + turn + '> is thinking...';
    }
    var reply = {
      'text': text,
      'attachments': [{
        'title': title,
        'text': getCells(game.cells),
        'fallback': fallback,
        'color': '#808080',
        'mrkdwn_in': ['text']
      }]
    };
    return reply;
  };

  function findWinner(game) {
    if (Object.keys(game.cells).length >= 5){
      const lines = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];
      var cnt_draw = 0;
      for (var i = 0; i < 8; i++) {
        var line = lines[i];
        var cnt_o = 0, cnt_x = 0;
        for (var j = 0; j < 3; j++) {
          console.log('i,j:'+i+','+j+' line:'+ line[j] + ' cell:' + game.cells[line[j]]);
          if (game.cells[line[j]] === 'O') {
            cnt_o++;
          } else if (game.cells[line[j]] === 'X') {
            cnt_x++;
          }
        }
        if (cnt_o === 3) {
          return 1;
        } else if (cnt_x === 3) {
          return 2;
        } else if (cnt_o > 0 && cnt_x > 0) {
          cnt_draw++;
        }
      }
      if (cnt_draw === 9) return 'DRAW';
    }
    return null;
  };

  zangyo_bot.startGame = function(bot, message) {
    var game = {};
    game.id = 'G' + message.user + luid();
    game.player_1 = message.user;
    game.player_2 = message.text.match(/\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
    game.current_turn = 1;
    game.cells = {};
    controller.storage.games.save(game);

    // game.cells = {'3': 'X', '5': 'X', '7': 'O', '8': 'O', '9': 'X'};
    bot.reply(message, getGameBoard(game, 1));
  };

  zangyo_bot.mark = function(bot, message, game_id, cell) {
    var user_id = message.user;

    controller.storage.games.get(game_id, function(err, game) {
      if (err) {
        console.log(err);
      } else {
        game.last_marker = user_id;
        game.last_cell   = cell;
        game.cells[cell] = game.current_turn === 1 ? 'O' : 'X';
        game.current_turn = game.current_turn === 1 ? 2 : 1;
        controller.storage.games.save(game);

        var winner = findWinner(game);
        console.log('winner:' + winner);
        if (winner) {
          game.winner = winner;
          controller.storage.games.save(game);
        }
        console.log('game:' + JSON.stringify(game));

        bot.replyInteractive(message, getCurrentBoard(game));

        var turn = game['player_' + game.current_turn];
        bot.startPrivateConversation({user: turn}, function(err,convo) {
          if (err) {
            console.log(err);
          } else {
            if (winner) {
              convo.say(getCurrentBoard(game));
            } else {
              convo.say(getGameBoard(game, 1));
            }
            convo.next();
          }
        });
      }
    });
  };

  zangyo_bot.page = function(bot, message, game_id, page) {
    controller.storage.games.get(game_id, function(err, game) {
      bot.replyInteractive(message, getGameBoard(game, page));
    });
  };





  zangyo_bot.delayApply = function(bot, message) {
    var reply = {
      'attachments': [
        {
          'text': 'Choose a time period you worked.',
          'callback_id': 'delay_apply',
          'fallback': 'Choose a time period you worked.',
          'color': '#aaa',
          'actions': [
            {
              'type': 'button',
              'name': 'night',
              'text': 'Night',
              'style': 'primary'
            },
            {
              'type': 'button',
              'name': 'morning',
              'text': 'Morning',
              'style': 'primary'
            },
            {
              'type': 'button',
              'name': 'holiday',
              'text': 'Holiday',
              'style': 'primary'
            }

          ]
        }
      ]
    }
    bot.reply(message, reply);
  };

  zangyo_bot.morningWorkWizard = function(bot, message) {
    bot.startConversation(message, function(err, convo){
      askInit(convo, zangyo_bot.periods.morning, false);
    });
  };

  zangyo_bot.zangyoWizard = function(bot, message) {
    bot.startConversation(message, function(err, convo){
      askInit(convo, zangyo_bot.periods.night, false);
    });
  };

  zangyo_bot.holidayWorkWizard = function(bot, message) {
    bot.startConversation(message, function(err, convo){
      askInit(convo, zangyo_bot.periods.holiday, false);
    });
  };

  zangyo_bot.morningWorkWizardDelay = function(bot, message) {
    bot.replyInteractive(message, 'OK. Let\'s apply for a morning work!! :sunrise:');
    bot.startConversation(message, function(err, convo){
      askInit(convo, zangyo_bot.periods.morning, true);
    });
  };

  zangyo_bot.zangyoWizardDelay = function(bot, message) {
    bot.replyInteractive(message, 'OK. Let\'s apply for a zangyo!! :night_with_stars:');
    bot.startConversation(message, function(err, convo){
      askInit(convo, zangyo_bot.periods.night, true);
    });
  };

  zangyo_bot.holidayWorkWizardDelay = function(bot, message) {
    bot.replyInteractive(message, 'OK. Let\'s apply for a holiday work!! :crossed_flags:');
    bot.startConversation(message, function(err, convo){
      askInit(convo, zangyo_bot.periods.holiday, true);
    });
  };

  function askInit(convo, period, is_delay) {
    var zangyo = {}
    zangyo.period = period;
    zangyo.is_delay = is_delay;
    askApprover(convo, zangyo);
  };

  function askApprover(convo, zangyo) {
    convo.ask('Who is your boss? [@your_boss_name]', function(response, convo) {
      if (response.text.match(/cancel|quit|exit|キャンセル|やめる/)) {
        convo.say('It\'s canceled!!');
        convo.next();
      } else if (!response.text.match(/^\<\@[a-zA-Z0-9]+\>/g)) {
        convo.say('Select your boss in the form of @your_boss_name.');
        convo.repeat();
        convo.next();
      } else {
        zangyo.id = 'Z' + response.user + luid();
        zangyo.team = response.team;
        zangyo.applicant = response.user;
        zangyo.approver = response.text.match(/^\<\@[a-zA-Z0-9]+\>/g)[0].slice(2, -1);
        if (zangyo.is_delay) {
          askDate(convo, zangyo);
          convo.next();
        } else {
          findTimezone(response.team, response.user, function(err, timezone){
            if (err || !timezone) {
              console.log(err || new Error('Timezone is null'));
            } else {
              switch (zangyo.period) {
                case zangyo_bot.periods.morning:
                  zangyo.date = moment().tz(timezone).add(1, 'days').format('YYYY-MM-DD');
                  askBeginTime(convo, zangyo);
                  break;
                case zangyo_bot.periods.night:
                  zangyo.date = moment().tz(timezone).format('YYYY-MM-DD');
                  askEndTime(convo, zangyo);
                  break;
                case zangyo_bot.periods.holiday:
                  askDate(convo, zangyo);
                  break;
              }
            }
            convo.next();
          });
        }
      }
    });
  };

  function askDate(convo, zangyo) {
    var question;
    if (zangyo.is_delay) {
      question = 'What\'s the date you worked? [YYYY/MM/DD]';
    } else {
      question = 'What\'s the date you will work? [YYYY/MM/DD]';
    }
    convo.ask(question, function(response, convo) {
      if (response.text.match(/cancel|quit|exit|キャンセル|やめる/)) {
        convo.say('It\'s canceled!!');
        convo.next();
      } else if (!response.text.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
        convo.say('Specify the date in the form of \'YYYY/MM/DD\'.');
        convo.repeat();
        convo.next();
      } else {
        var ymd = response.text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        var date = ymd[1] + '-' + ('0' + ymd[2]).slice(-2) + '-' + ('0' + ymd[3]).slice(-2);
        if (isValidDate(date)) {
          findTimezone(response.team, response.user, function(err, timezone){
            if (err || !timezone) {
              console.log(err || new Error('Timezone is null'));
            } else {
              var today = moment().tz(timezone).format('YYYY-MM-DD');
              if (zangyo.is_delay && date > today) {
                convo.say('Specify the *PAST DATE*.');
                convo.repeat();
              } else if (!zangyo.is_delay && date <= today) {
                convo.say('Specify the *FUTURE DATE* or `apply for the past` holiday work.');
                convo.repeat();
              } else {
                zangyo.date = date;
                switch (zangyo.period) {
                  case zangyo_bot.periods.night:
                    askEndTime(convo, zangyo);
                    break;
                  default:
                    askBeginTime(convo, zangyo);
                    break;
                }
              }
            }
            convo.next();
          });
        } else {
          convo.say('Specify the date in the form of \'YYYY/MM/DD\'.');
          convo.repeat();
          convo.next();
        }
      }
    });
  };

  function askBeginTime(convo, zangyo) {
    var question;
    if (zangyo.is_delay) {
      question = 'What time did you start to work? [HH:MM]';
    } else {
      question = 'What time will you start to work? [HH:MM]';
    }
    convo.ask(question, function(response, convo) {
      if (response.text.match(/cancel|quit|exit|キャンセル|やめる/)) {
        convo.say('It\'s canceled!!');
      } else if (!response.text.match(/^([0-1]?[0-9]|2[0-3]):([0-5]?[0-9])$/)) {
        convo.say('Specify the time in the form of \'HH:MM\'. Maximum available time is 23:59.');
        convo.repeat();
      } else {
        var hm = response.text.match(/(\d{1,2}):(\d{1,2})/);
        zangyo.begin_time = ('0' + hm[1]).slice(-2) + ':' + ('0' + hm[2]).slice(-2);
        switch (zangyo.period) {
          case zangyo_bot.periods.morning:
            askReason(convo, zangyo);
            break;
          case zangyo_bot.periods.holiday:
            askEndTime(convo, zangyo);
            break;
        }
      }
      convo.next();
    });
  };

  function askEndTime(convo, zangyo) {
    var question;
    if (zangyo.is_delay) {
      question = 'What time did you finish? [HH:MM]';
    } else {
      question = 'What time will it be done? [HH:MM]';
    }
    convo.ask(question, function(response, convo) {
      if (response.text.match(/cancel|quit|exit|キャンセル|やめる/)) {
        convo.say('It\'s canceled!!');
      } else if (!response.text.match(/^([0-2]?[0-9]):([0-5]?[0-9])$/)) {
        convo.say('Specify the time in the form of \'HH:MM\'. Maximum available time is 29:59.');
        convo.repeat();
      } else {
        var hm = response.text.match(/(\d{1,2}):(\d{1,2})/);
        var end_time = ('0' + hm[1]).slice(-2) + ':' + ('0' + hm[2]).slice(-2);
        if (zangyo.begin_time && zangyo.begin_time > end_time) {
          convo.say('Finished before the beginning time(' + zangyo.begin_time + ')? No way...');
          convo.repeat();
        } else {
          zangyo.end_time = end_time;
          askReason(convo, zangyo);
        }
      }
      convo.next();
    });
  };

  function askReason(convo, zangyo) {
    var question;
    if (zangyo.is_delay) {
      question = 'What were things you workd on?';
    } else {
      question = 'What are things to do?';
    }
    convo.ask(question, function(response, convo) {
      zangyo.reason = response.text;
      controller.storage.zangyos.save(zangyo);
      var summary = getApplicationSummary(zangyo, true);
      convo.say(summary);
      convo.next();
    });
  };

  zangyo_bot.createApplication = function(bot, message, approver, end_time, reason) {
    findUserId(message.team_id, approver, function(err, approver_id) {
      if (approver_id) {
        findTimezone(message.team_id, message.user_id, function(err, timezone){
          if (err) {
            console.log(err);
          } else if (timezone) {
            var zangyo = {}
            zangyo.id = 'Z' + message.user_id + luid();
            zangyo.team = message.team_id;
            zangyo.date = moment().tz(timezone).format('YYYY-MM-DD');
            zangyo.applicant = message.user_id;
            zangyo.approver = approver_id;
            zangyo.end_time = end_time;
            zangyo.reason = reason;
            controller.storage.zangyos.save(zangyo);
            var summary = getApplicationSummary(zangyo, false);
            bot.replyPrivate(message, summary);
          } else {
            console.log(new Error('Timezone is null'));
          }
        });
      } else {
        bot.replyPrivate(message, '`Approver` is invalid!!');
      }
    });
  };

  function findUserId(team_id, username, cb) {
    controller.storage.teams.get(team_id, function(err, team) {
      if (err) {
        cb(err);
      } else if (team && team.token) {
        var api_data = {'token': team.token};
        callAPI('users.list', api_data, function(err, data){
          if (err) {
            cb(err);
          } else if (data.members) {
            for (var i = 0; i < data.members.length; i++) {
              var member = data.members[i];

              if (!member.deleted && member.name == username) {
                cb(null, member.id);
                break;
              }
              if (i == data.members.length-1) {
                cb();
              }
            }
          } else {
            cb();
          }
        });
      } else {
        cb();
      }
    });
  };

  function findTimezone(team_id, user_id, cb) {
    controller.storage.teams.get(team_id, function(err, team) {
      if (err) {
        cb(err);
      } else if (team && team.token) {
        var api_data = {'token': team.token, 'user': user_id};
        callAPI('users.info', api_data, function(err, data){
          if (err) {
            cb(err);
          } else if (data.user) {
            cb(null, data.user.tz);
          } else {
            cb();
          }
        });
      } else {
        cb();
      }
    });
  };

  function applicationAttachment(zangyo, _fallback, _callback_id, _actions) {
    var title, field_title, be_verb,  color, footer, ts;

    if (zangyo.is_delay) {
      be_verb = 'was';
    } else {
      be_verb = 'will be';
    }

    switch (zangyo.period) {
      case zangyo_bot.periods.morning:
        title = ':sunrise: Morning Work Application';
        field_title = 'From ' + zangyo.begin_time;
        break;
      case zangyo_bot.periods.night:
        title = ':night_with_stars: Zangyo Application';
        field_title = 'Until ' + zangyo.end_time;
        break;
      case zangyo_bot.periods.holiday:
        title = ':crossed_flags: Holiday Work Application';
        field_title = 'From ' + zangyo.begin_time + ' to ' + zangyo.end_time;
        break;
    }

    if (!zangyo.approved_at) {
      color = '#aaa';
      footer = zangyo.applied_at ? 'Applied by <@' + zangyo.applicant + '>' : '';
      ts = zangyo.applied_at ? zangyo.applied_at : '';
    } else if (zangyo.approved) {
      color = 'good';
      footer = 'Approved by <@' + zangyo.approver + '>';
      ts = zangyo.approved_at;
    } else {
      color = 'danger';
      footer = 'Rejected by <@' + zangyo.approver + '>';
      ts = zangyo.approved_at;
    }

    var attachment = {
      'fallback': _fallback || '',
      'callback_id': _callback_id || '',
      'color': color,
      'title': title + ' - ' + moment(zangyo.date).format('MM/DD(ddd)'),
      'text': '<@' + zangyo.applicant + '>  >>>  <@' + zangyo.approver + '>',
      'fields': [
        {
          'title': field_title + ', the following things ' + be_verb + ' done.',
          'value': zangyo.reason,
          'short': false
        }
      ],
      'actions': _actions || {},
      'footer': footer || '',
      'ts': ts || ''
    }

    if (zangyo.approver_comment) {
      var comment_field = {
        'title': 'Approver comments.',
        'value': zangyo.approver_comment,
        'short': false
      }
      attachment.fields.push(comment_field);
    }

    return attachment;
  };

  function getApplicationSummary(zangyo, can_redo) {
    var actions = [
      {
        'type': 'button',
        'name': 'apply',
        'text': 'Submit',
        'style': 'primary'
      },
      {
        'type': 'button',
        'name': 'cancel',
        'text': 'Cancel'
      }
    ];
    if (can_redo) {
      actions.push(
        {
          'type': 'button',
          'name': 'redo',
          'text': 'Redo'
        }
      );
    }
    var fallback = 'Application to <@' + zangyo.approver + '>.';
    var callback_id = 'apply-' + zangyo.id;
    var attachment = applicationAttachment(zangyo, fallback, callback_id, actions);
    var summary = {
      'text': 'Ready to submit?',
      'attachments': [attachment]
    }
    return summary;
  };

  zangyo_bot.apply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      zangyo.applied_at = zangyo.applied_at || moment().unix();
      controller.storage.zangyos.save(zangyo);
      var fallback = 'Application to <@' + zangyo.approver + '>.';
      var attachment = applicationAttachment(zangyo, fallback, null, null);
      var summary = {
        'text': 'Your application was submitted.',
        'attachments': [attachment]
      }
      bot.replyInteractive(message, summary);
      bot.startPrivateConversation({user: zangyo.approver}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          var fallback = 'Application from <@' + zangyo.applicant + '>.';
          var callback_id = 'approve-' + zangyo.id;
          var actions = [
            {
              'type': 'button',
              'name': 'approve',
              'text': 'Approve',
              'style': 'primary'
            },
            {
              'type': 'button',
              'name': 'reject',
              'text': 'Reject',
              'style': 'danger'
            },
            {
              'type': 'button',
              'name': 'reject-comment',
              'text': 'Reject with comments',
              'style': 'danger'
            }
          ]
          findTimezone(zangyo.team, zangyo.approver, function(err, timezone){
            if (err || !timezone) {
              console.log(err || new Error('Timezone is null'));
            } else {
              if (zangyo.date < moment().tz(timezone).format('YYYY-MM-DD')) {
                actions[0].confirm = {
                  'title': 'The past date application',
                  'text': 'The application date has already passed. Are you sure to approve?',
                  'ok_text': 'Yes',
                  'dismiss_text': 'No'
                }
              }
              var attachment = applicationAttachment(zangyo, fallback, callback_id, actions);
              var application = {
                'text': 'Application received!! Reply ASAP!!',
                'attachments': [attachment]
              }
              convo.say(application);
            }
            convo.next();
          });
        }
      });
    });
  };

  zangyo_bot.redoApply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      bot.replyInteractive(message, 'Redo from the beginning!!');
      bot.startConversation(message, function(err, convo){
        askInit(convo, zangyo.period, zangyo.is_delay);
      });
    });
    controller.storage.zangyos.remove(zangyo_id);
  };

  zangyo_bot.cancelApply = function(zangyo_id, bot, message) {
    controller.storage.zangyos.remove(zangyo_id);
    bot.replyInteractive(message, 'It\'s canceled!! Go back home now!!');
  };

  zangyo_bot.approve = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      if (zangyo.approved_at) {
        bot.reply(message, 'It\'s processed already.');
        bot.replyInteractive(message, getSummary(zangyo, true, true));
        return;
      }

      zangyo.approved = true;
      zangyo.approved_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      bot.startPrivateConversation({user: zangyo.applicant}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say(getSummary(zangyo, false, true));
          convo.next();
        }
      });
    });
  };

  zangyo_bot.rejectApprove = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      if (zangyo.approved_at) {
        bot.reply(message, 'It\'s processed already.');
        bot.replyInteractive(message, getSummary(zangyo, true, true));
        return;
      }

      zangyo.approved = false;
      zangyo.approved_at = moment().unix();
      controller.storage.zangyos.save(zangyo);
      bot.replyInteractive(message, getSummary(zangyo, true, true));

      bot.startPrivateConversation({user: zangyo.applicant}, function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say(getSummary(zangyo, false, true));
          convo.next();
        }
      });
    });
  };

  zangyo_bot.rejectCommentApprove = function(zangyo_id, bot, message) {
    controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
      delete zangyo['approver_comment'];
      bot.replyInteractive(message, getSummary(zangyo, true, false));
    });

    bot.startConversation(message, function(err, convo){
      convo.ask('Give me your comments!!', function(response, convo) {
        controller.storage.zangyos.get(zangyo_id, function(err, zangyo) {
          zangyo.approver_comment = response.text;
          controller.storage.zangyos.save(zangyo);
          var fallback = 'Application from <@' + zangyo.applicant + '>.';
          var callback_id = 'approve-' + zangyo.id;
          var actions = [
            {
              'type': 'button',
              'name': 'reject',
              'text': 'Reject',
              'style': 'danger'
            },
            {
              'type': 'button',
              'name': 'reject-comment',
              'text': 'Edit comments',
              'style': 'default'
            }
          ]
          var attachment = applicationAttachment(zangyo, fallback, callback_id, actions);
          var application = {
            'text': 'Ready to reject?',
            'attachments': [attachment]
          }
          convo.say(application);
          convo.next();
        });
      });
    });
  };

  function getSummary(zangyo, is_reply, is_processed) {
    var result_word, text, fallback;

    if (is_processed) {
      if (zangyo.approved) {
        result_word = 'approved';
      } else {
        result_word = 'rejected';
      }

      if (is_reply) {
        text = 'You ' + result_word + ' an application from <@' + zangyo.applicant + '>.';
      } else {
        text = '<@' + zangyo.applicant + '> Your application was ' + result_word + '.';
      }

      fallback = 'Application from <@' + zangyo.applicant + '> was ' + result_word + '.';
    } else {
      result_word = 'rejected';

      if (is_reply) {
        text = 'Application will be ' + result_word + '.';
      }

      fallback = 'Application from <@' + zangyo.applicant + '> will be ' + result_word + '.';
    }

    var attachment = applicationAttachment(zangyo, fallback, null, null);
    var summary = {
      'text': text,
      'attachments': [attachment]
    }
    return summary;
  };

  zangyo_bot.replyListByName = function(bot, message, range, applicant, filter, period, is_detailed) {
    findUserId(message.team, applicant, function(err, applicant_id) {
      zangyo_bot.replyList(bot, message, range, applicant_id, filter, period, is_detailed);
    });
  };

  zangyo_bot.replyList = function(bot, message, range, applicant, filter, period, is_detailed) {
    if (is_detailed) {
      buildDetailedMessage(bot, message, range, applicant, filter, period);
    } else {
      buildSimplifiedMessage(bot, message, range, applicant, filter, period);
    }
  };

  function buildSimplifiedMessage(bot, message, range, applicant, filter, period) {
    findTargetZangyo(message, range, applicant, filter, period, function(zangyo){
      var field = {};
      var icon, work_time;
      if (zangyo.approved == null) {
        icon = ':speech_balloon:';
      } else if (zangyo.approved) {
        icon = ':white_check_mark:';
      } else {
        icon = ':x:';
      }

      switch (zangyo.period) {
        case zangyo_bot.periods.morning:
          work_time = ':sunrise: From ' + zangyo.begin_time;
          break;
        case zangyo_bot.periods.night:
          work_time = ':night_with_stars: Until ' + zangyo.end_time;
          break;
        case zangyo_bot.periods.holiday:
          work_time = ':crossed_flags: ' + zangyo.begin_time + '-' + zangyo.end_time;
          break;
        default:
          work_time = ':night_with_stars: Until ' + zangyo.end_time;
          break;
      }

      field.value = icon + moment(zangyo.date).format('MM/DD ') + work_time + ' - <@' + zangyo.applicant + '>' ;
      field.short = false

      return field;
    }, function(fields, applicant, filter, period){
      var reply;
      var applicant_text = applicant ? 'of <@' + applicant + '> ' : '';
      var period_text = period ? ' ' + period : '';
      if (fields.length == 0) {
        reply = 'There is no ' + filter + period_text + ' items ' + applicant_text + 'of ' + range + '.';
      } else if (fields.length < 100) {
        reply = {
          'text': 'The ' + filter + period_text + ' list ' + applicant_text + 'of ' + range + '.',
          'attachments': [
            {
              'color': '#aaa',
              'fields': fields
            }
          ]
        }
      } else {
        reply = {
          'text': 'The ' + filter + period_text + ' list ' + applicant_text + 'of ' + range + ' has more than 100 zangyos. Please adjust search conditions... :face_with_rolling_eyes:',
          'attachments': [
            {
              'color': '#aaa',
              'fields': fields
            }
          ]
        }
      }

      if (message.command) {
        bot.replyPublic(message, reply);
      } else {
        bot.reply(message, reply);
      }
    });
  };

  function buildDetailedMessage(bot, message, range, applicant, filter, period) {
    findTargetZangyo(message, range, applicant, filter, period, function(zangyo){
      var work_time;
      var attachment = {};
      if (zangyo.approved == null) {
        attachment.color = '#aaa';
        attachment.footer = 'Waiting for <@' + zangyo.approver + '>\'s reply.';
      } else if (zangyo.approved) {
        attachment.color = 'good';
        attachment.footer = 'Approved by <@' + zangyo.approver + '>.';
      } else {
        attachment.color = 'danger';
        attachment.footer = 'Rejected by <@' + zangyo.approver + '>.';
      }

      switch (zangyo.period) {
        case zangyo_bot.periods.morning:
          work_time = ':sunrise: From ' + zangyo.begin_time;
          break;
        case zangyo_bot.periods.night:
          work_time = ':night_with_stars: Until ' + zangyo.end_time;
          break;
        case zangyo_bot.periods.holiday:
          work_time = ':crossed_flags: ' + zangyo.begin_time + '-' + zangyo.end_time;
          break;
        default:
          work_time = ':night_with_stars: Until ' + zangyo.end_time;
          break;
      }

      attachment.title = moment(zangyo.date).format('MM/DD ') + work_time + ' - <@' + zangyo.applicant + '>';
      attachment.text = zangyo.reason;
      if (zangyo.approver_comment) {
        attachment.fields = [
          {
            'title': 'Approver comments.',
            'value': zangyo.approver_comment,
            'short': false
          }
        ];
      }
      attachment.ts = zangyo.approved_at ? zangyo.approved_at : zangyo.applied_at;

      return attachment;
    }, function(attachments, applicant, filter, period){
      var reply;
      var applicant_text = applicant ? 'of <@' + applicant + '> ' : '';
      var period_text = period ? ' ' + period : '';
      if (attachments.length == 0) {
        reply = 'There is no ' + filter + period_text + ' items ' + applicant_text + 'of ' + range + '.';
      } else if (attachments.length < 100) {
        reply = {
          'text': 'The detailed ' + filter + period_text + ' list ' + applicant_text + 'of ' + range + '.',
          'attachments': attachments
        }
      } else {
        reply = {
          'text': 'The ' + filter + period_text + ' list ' + applicant_text + 'of ' + range + ' has more than 100 zangyos. Please adjust search conditions... :face_with_rolling_eyes:',
          'attachments': attachments
        }
      }

      if (message.command) {
        bot.replyPublic(message, reply);
      } else {
        bot.reply(message, reply);
      }
    });
  };

  function findTargetZangyo(message, range, applicant, filter, period, getMessageItem, replyWholeMessage) {
    findTimezone(message.team, message.user, function(err, timezone){
      if (err) {
        console.log(err);
        return;
      }

      if (!timezone) {
        console.log(new Error('Timezone is null'));
        return;
      }

      var today = moment().tz(timezone).format('YYYY-MM-DD');
      var begin_date, end_date;
      switch (range) {
        case zangyo_bot.ranges.today:
          begin_date = today;
          end_date = today
          break;
        case zangyo_bot.ranges.yesterday:
          var yesterday = moment().tz(timezone).subtract(1, 'days').format('YYYY-MM-DD');
          begin_date = yesterday;
          end_date = yesterday;
          break;
        case zangyo_bot.ranges.day_before_yesterday:
          var day_before_yesterday = moment().tz(timezone).subtract(2, 'days').format('YYYY-MM-DD');
          begin_date = day_before_yesterday;
          end_date = day_before_yesterday;
          break;
        case zangyo_bot.ranges.this_week:
          begin_date = moment().tz(timezone).startOf('isoweek').format('YYYY-MM-DD');
          end_date = moment().tz(timezone).endOf('isoweek').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.last_week:
          var lastweek = moment().tz(timezone).subtract(1, 'weeks');
          begin_date = lastweek.startOf('isoweek').format('YYYY-MM-DD');
          end_date = lastweek.endOf('isoweek').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.week_before_last:
          var base_date = moment().tz(timezone).subtract(2, 'weeks');
          begin_date = base_date.startOf('isoweek').format('YYYY-MM-DD');
          end_date = base_date.endOf('isoweek').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.past_one_week:
          begin_date = moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
          end_date = today;
          break;
        case zangyo_bot.ranges.this_month:
          begin_date = moment().tz(timezone).startOf('month').format('YYYY-MM-DD');
          end_date = moment().tz(timezone).endOf('month').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.last_month:
          var lastmonth = moment().tz(timezone).subtract(1, 'months');
          begin_date = lastmonth.startOf('month').format('YYYY-MM-DD');
          end_date = lastmonth.endOf('month').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.month_before_last:
          var lastmonth = moment().tz(timezone).subtract(2, 'months');
          begin_date = lastmonth.startOf('month').format('YYYY-MM-DD');
          end_date = lastmonth.endOf('month').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.tomorrow:
          var tomorrow = moment().tz(timezone).add(1, 'days').format('YYYY-MM-DD');
          begin_date = tomorrow;
          end_date = tomorrow;
          break;
        case zangyo_bot.ranges.day_after_tomorrow:
          var dat = moment().tz(timezone).add(2, 'days').format('YYYY-MM-DD');
          begin_date = dat;
          end_date = dat;
          break;
        case zangyo_bot.ranges.two_days_after_tomorrow:
          var dat = moment().tz(timezone).add(3, 'days').format('YYYY-MM-DD');
          begin_date = dat;
          end_date = dat;
          break;
        case zangyo_bot.ranges.next_week:
          var nextweek = moment().tz(timezone).add(1, 'weeks');
          begin_date = nextweek.startOf('isoweek').format('YYYY-MM-DD');
          end_date = nextweek.endOf('isoweek').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.week_after_next:
          var base_date = moment().tz(timezone).add(2, 'weeks');
          begin_date = base_date.startOf('isoweek').format('YYYY-MM-DD');
          end_date = base_date.endOf('isoweek').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.next_month:
          var nextmonth = moment().tz(timezone).add(1, 'months');
          begin_date = nextmonth.startOf('month').format('YYYY-MM-DD');
          end_date = nextmonth.endOf('month').format('YYYY-MM-DD');
          break;
        case zangyo_bot.ranges.month_after_next:
          var base_date = moment().tz(timezone).add(2, 'months');
          begin_date = base_date.startOf('month').format('YYYY-MM-DD');
          end_date = base_date.endOf('month').format('YYYY-MM-DD');
          break;
        default:
          if (range.match(/\d{1,2}/g)) {
            var target = range.match(/\d{1,2}/g);

            var year = moment().tz(timezone).format('YYYY');
            var month = ('0' + target[0]).slice(-2);
            var day = ('0' + target[1]).slice(-2);

            var this_year = year + '-' + month + '-' + day, timezone;
            var last_year = (year * 1 - 1) + '-' + month + '-' + day, timezone;
            var next_year = (year * 1 + 1) + '-' + month + '-' + day, timezone;

            var diffs = [
              Math.abs(moment().tz(timezone) - moment.tz(last_year, timezone)),
              Math.abs(moment().tz(timezone) - moment.tz(this_year, timezone)),
              Math.abs(moment().tz(timezone) - moment.tz(next_year, timezone))
            ];
            var idx = diffs.indexOf(Math.min.apply(null, diffs));

            switch (idx) {
              case 0:
                begin_date = last_year;
                end_date = last_year;
                break;
              case 1:
                begin_date = this_year;
                end_date = this_year;
                break;
              case 2:
                begin_date = next_year;
                end_date = next_year;
                break;
            }
            console.log(begin_date);

          } else {
            begin_date = today;
            end_date = today
          }
          break;
      }

      var selector = {
        team: message.team,
        applied_at: {$exists: true},
        date: {$gte: begin_date, $lte: end_date}
      };
      if (applicant) selector.applicant = applicant;
      if (period) selector.period = period;
      var sort = {date: 1, start_time: 1, end_time: 1};
      controller.storage.zangyos.select(selector, sort, function(err, zangyos) {
        var list = [];

        for (var i = 0; i < zangyos.length; i++) {
          var zangyo = zangyos[i];

          switch (filter) {
            case zangyo_bot.filters.approved:
              if (!zangyo.approved) continue;
              break;
            case zangyo_bot.filters.latest:
              if (!zangyo.approved) continue;
              var is_latest = true;
              var j = 1;
              while (is_latest && i+j < zangyos.length && zangyo.date === zangyos[i+j].date) {
                if (zangyos[i+j].approved
                    && zangyo.applicant === zangyos[i+j].applicant) is_latest = false;
                j++;
              }
              if (!is_latest) continue;
              break;
            default:
              break;
          }

          list.push(getMessageItem(zangyo));

          if (list.length >= 100) break;
        }

        replyWholeMessage(list, applicant, filter, period);
      });
    });
  };

  zangyo_bot.replyPendingList = function(bot, message) {
    findTimezone(message.team, message.user, function(err, timezone){
      if (err) {
        console.log(err);
        return;
      }

      if (!timezone) {
        console.log(new Error('Timezone is null'));
        return;
      }

      var selector = {team: message.team, applied_at: {$exists: true}, approved: {$exists: false}};
      var sort = {applicant: 1, start_time: -1, end_time: -1};
      controller.storage.zangyos.select(selector, sort, function(err, zangyos) {
        var attachments = [];

        for (var i = 0; i < zangyos.length; i++) {
          var zangyo = zangyos[i];
          if (zangyo.approver == message.user) {
            var fallback = 'Application from <@' + zangyo.applicant + '>.';
            var callback_id = 'approve-' + zangyo.id;
            var actions = [
              {
                'type': 'button',
                'name': 'approve',
                'text': 'Approve',
                'style': 'primary'
              },
              {
                'type': 'button',
                'name': 'reject',
                'text': 'Reject',
                'style': 'danger'
              },
              {
                'type': 'button',
                'name': 'reject-comment',
                'text': 'Reject with comments',
                'style': 'danger'
              }
            ]
            var attachment = applicationAttachment(zangyo, fallback, callback_id, actions);
            attachments.push(attachment);
          } else if (zangyo.applicant == message.user) {
            var fallback = 'Application to <@' + zangyo.approver + '>.';
            var callback_id = 'apply-' + zangyo.id;
            var actions = [
              {
                'type': 'button',
                'name': 'apply',
                'text': 'Resubmit',
                'style': 'primary'
              }
            ]
            var attachment = applicationAttachment(zangyo, fallback, callback_id, actions);
            attachments.push(attachment);
          }
        }

        var reply;
        if (attachments.length > 0) {
          reply = {
            'text': 'The waiting zangyo list from/to you.',
            'attachments': attachments
          }
        } else {
          reply = 'There is no waiting zangyos from/to you.';
        }

        bot.reply(message, reply);
      });
    });
  };

  return zangyo_bot;
}

module.exports = ZangyoBot;
