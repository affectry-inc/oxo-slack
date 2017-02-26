'use strict';

var luid = require('./utils').luid;
var callAPI = require('./utils').callAPI;

function SlackBot(controller) {
  var slack_bot = {};

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

  slack_bot.startGame = function(bot, message) {
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

  slack_bot.page = function(bot, message, game_id, page) {
    controller.storage.games.get(game_id, function(err, game) {
      bot.replyInteractive(message, getGameBoard(game, page));
    });
  };

  return slack_bot;
}

module.exports = SlackBot;
