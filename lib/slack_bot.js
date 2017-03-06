'use strict';

var luid = require('./utils').luid;
var callAPI = require('./utils').callAPI;

function SlackBot(controller) {
  var slack_bot = {};

  /**
   * @param cells_j: json formatted cell vals
   * @return string formatted cell vals to display
   */
  function getCells(cells_j) {
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

  /**
   * @param cells_j: JSON formatted cell vals
   * @param page: page for action buttons [1-3]
   * @return an array of json objects of action  buttons
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
            'style': 'danger',
            'name': 'cell-' + i,
            'text': i + ''
          })
          j++;
        }
      }
    }
    return actions;
  };

  /**
   * @param game: JSON object of game data
   * @param page: int val of pagination of action buttons
   * @return string formatted game data to display with buttons
   */
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
        'color': 'good',
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

  /**
   * @param game: JSON object of game data
   * @param user_id: caller user's id
   * @return string formatted game data to display without buttons
   */
  function getCurrentBoard(game, user_id) {
    var text, title, fallback, color;
    if (game.winner) {
      text = '<@' + game.player_1 + '> VS <@' + game.player_2 + '>';
      if (game.winner === 'DRAW') {
        title = 'DRAW GAME!!';
        color = '#aaa';
      } else if (user_id === game['player_' + game.winner]) {
        title = 'Congratulations!! You win!!';
        color = '#33ccff';
      } else if (user_id === game.player_1 || user_id === game.player_2) {
        title = 'Ooops!! You lose!!';
        color = 'danger';
      } else {
        title = ' <@' + game['player_' + game.winner] + '> won!';
        color = '#ccc';
      }
      fallback = '<@' + game.player_1 + '> VS <@' + game.player_2 + '>';
    } else {
      var turn = game['player_' + game.current_turn];
      text = '<@' + game.last_marker + '> marked cell #' + game.last_cell+ '.';
      title = 'Now <@' + turn + '> is thinking... :thinking_face:';
      fallback = '<@' + turn + '> is thinking...';
      color = '#ccc';
    }
    var reply = {
      'text': text,
      'attachments': [{
        'title': title,
        'text': getCells(game.cells),
        'fallback': fallback,
        'color': color,
        'mrkdwn_in': ['text']
      }]
    };
    return reply;
  };

  /**
   * @param game: JSON object of game data
   * @return val of winner (in int) or string 'DRAW' (1/2/DRAW) or null for on going game
   */
  function findWinner(game) {
    if (Object.keys(game.cells).length >= 5){
      const lines = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];
      var cnt_draw = 0, cnt_x_reached = 0;
      for (var i = 0; i < 8; i++) {
        var line = lines[i];
        var cnt_o = 0, cnt_x = 0;
        for (var j = 0; j < 3; j++) {
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
        } else if (cnt_o === 0 && cnt_x === 2) {
          cnt_x_reached++;
        } else if (cnt_o > 0 && cnt_x > 0) {
          cnt_draw++;
        }
      }
      if ((cnt_x_reached + cnt_draw) === 8) return 'DRAW';
    }
    return null;
  };

  /**
   * @param team_id: team id of players
   * @param user_id: user id of player
   * @param score: win->3, draw->1, loss->0
   * @return null
   */
  function recordSummary(team_id, user_id, score) {
    controller.storage.games.get('S' + team_id + user_id, function(err, summary) {
      if (err) {
        console.log(err);
      } else {
        if (!summary) {
          summary = {};
          summary.id = 'S' +team_id + user_id;
          summary.team = team_id;
          summary.user = user_id;
          summary.win = 0;
          summary.loss = 0;
          summary.draw = 0;
          summary.score = 0;
        }
        if (score === 3) {
          summary.win++
        } else if (score === 1) {
          summary.draw++
        } else if (score === 0) {
          summary.loss++
        }
        summary.score += score;

        controller.storage.summaries.save(summary);
      }
    });
  };

  /**
   * @param bot
   * @param message
   * @return reply to the sender who just started a new game
   */
  slack_bot.startGame = function(bot, message) {
    var game = {};
    game.id = 'G' + message.user + luid();
    game.player_1 = message.user;
    game.player_2 = message.text.match(/\<\@[a-zA-Z0-9]+(\||\>)/g)[0].slice(2, -1);
    game.current_turn = 1;
    game.cells = {};
    controller.storage.games.save(game);

    // game.cells = {'3': 'X', '5': 'X', '7': 'O', '8': 'O', '9': 'X'};
    if (message.command) {
      bot.replyPublic(message, getGameBoard(game, 1));
    } else {
      bot.reply(message, getGameBoard(game, 1));
    }
  };

  /**
   * @param bot
   * @param message
   * @return reply to the sender who just started a new game
   */
  slack_bot.leaderboard = function(bot, message) {
    var team_id = message.command ? message.team_id : message.team;
    var cond = {team: team_id};
    var sort = {score: 1, win: 1, draw: 1, loss: -1};
    controller.storage.summaries.select(cond, sort, function(err, summaries) {
      if (err) {
        console.log(err);
      } else {
        var reply = {}
        if (summaries.length == 0) {
          reply = 'There is no record in your team yet. :ghost:';
        } else {
          var fields = [];
          for (var i = 0; i < summaries.length; i++) {
            var summary = summaries[i];
            var field = {
              'value': (i+1) + '. <@' + summary.user + '>(SCORE:' + summary.score + ')',
              'short': false
            }
            fields.push(field);
          }
          reply = {
            'attachments': [{
              'title': 'oxo leaderboard of your team.',
              'fallback': 'oxo leaderboard of your team.',
              'color': 'good',
              'mrkdwn_in': ['fields'],
              'fields': fields
            }]
          };
        }
        if (message.command) {
          bot.replyPublic(message, reply);
        } else {
          bot.reply(message, reply);
        }
      }
    });
  };

  /**
   * @param bot
   * @param message
   * @param game_id: id of game object
   * @param cell: marked cell #
   * @return transfer the game board to the opponent
   */
  slack_bot.mark = function(bot, message, game_id, cell) {
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

        var opponent = game['player_' + game.current_turn];

        var winner = findWinner(game);
        if (winner) {
          game.winner = winner;
          controller.storage.games.save(game);

          if (user_id === opponent) {
            // Do nothing
          } else if (winner === 'DRAW') {
            recordSummary(message.team.id, user_id, 1);
            recordSummary(message.team.id, opponent, 1);
          } else {
            recordSummary(message.team.id, user_id, 3);
            recordSummary(message.team.id, opponent, 0);
          }
        }

        bot.replyInteractive(message, getCurrentBoard(game));

        bot.startPrivateConversation({user: opponent}, function(err,convo) {
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

  /**
   * @param bot
   * @param message
   * @param game_id: id of game object
   * @param page: pagenation # of new page
   * @return game board of the new page
   */
  slack_bot.page = function(bot, message, game_id, page) {
    controller.storage.games.get(game_id, function(err, game) {
      bot.replyInteractive(message, getGameBoard(game, page));
    });
  };

  return slack_bot;
}

module.exports = SlackBot;
