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

exports.luid = luid;
exports.callAPI = callAPI;
