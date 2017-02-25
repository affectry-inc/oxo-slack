'use strict';

var request = require('request');

function noop() {}

/*
 * local unique identifier
 */
var luid = function() {
  return new Date().getTime().toString(36).toUpperCase();
}

/*
 * API caller
 *
 * @param {string} command slack api command
 * @param {Object} data must contain 'token'
 */
var callAPI = function(command, data, cb, multipart) {
  cb = cb || noop;

  var params = {
    url: 'https://slack.com/api/' + command
  };

  if (multipart === true) {
      params.formData = data;
  } else {
      params.form = data;
  }

  request.post(params, function(error, response, body) {
      if (!error && response.statusCode == 200) {
          var json;
          try {
              json = JSON.parse(body);
          } catch (parseError) {
              return cb(parseError);
          }

          if (json.ok) {
              return cb(null, json);
          }
          return cb(json.error, json);
      }
      return cb(error || new Error('Invalid response'));
  });
};

/*
 * Date validator
 *
 * @param {string} 4-2-2 digits date [YYYY-MM-DD]
 */
var isValidDate = function(text) {
  var m, dateobj, datestr;
  m = text.match(/(\d{4})\-(\d{2})\-(\d{2})/);
  if(m != null) {
    dateobj = new Date(m[1], m[2] - 1, m[3]);
    datestr = dateobj.getFullYear() + '-' +
      ('0' + (dateobj.getMonth() + 1)).slice(-2) + '-' +
      ('0' + dateobj.getDate()).slice(-2);
    if(m[0] == datestr.toString(10)) {
      return true;
    }
  }
  return false;
};

exports.luid = luid;
exports.callAPI = callAPI;
exports.isValidDate = isValidDate;
