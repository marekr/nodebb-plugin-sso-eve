(function(module) {
	"use strict";

	var User = module.parent.require('./user'),
		Groups = module.parent.require('./groups'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		winston = module.parent.require('winston'),
		async = module.parent.require('async'),
		passportOAuth = require('passport-oauth').OAuth2Strategy;

	var authenticationController = module.parent.require('./controllers/authentication');

	var constants = Object.freeze({
			name: 'EVE Online',	// Something unique to your OAuth provider in lowercase, like "github", or "nodebb"
			providerName: 'eve',
			icon: 'fa-shield',
			oauth2: {
				authorizationURL: 'https://login.eveonline.com/oauth/authorize/',
				tokenURL: 'https://login.eveonline.com/oauth/token',
				clientID: 'a1bcd471533b4dc69dc101aebc05f627',
				clientSecret: 'GRXMbDsgeSeRnczkCm3Wlo5wgH6yoltbXXGqjqrn'
			},
			'admin': {
				'route': '/plugins/sso-eve',
				'icon': 'fa-shield'
			},
			userRoute: 'https://login.eveonline.com/oauth/verify'	// This is the address to your app's "user profile" API endpoint (expects JSON)
		});

	var EveAuth = {}, opts;

	EveAuth.getStrategy = function(strategies, callback) {
		// OAuth 2 options
		opts = constants.oauth2;

		if(EveAuth.settings !== undefined &&
			EveAuth.settings.hasOwnProperty('clientId') && EveAuth.settings.clientId &&
			EveAuth.settings.hasOwnProperty('clientSecret') && EveAuth.settings.clientSecret
			)
		{
			opts.clientID = EveAuth.settings.clientId;
			opts.clientSecret = EveAuth.settings.clientSecret;
			opts.callbackURL = nconf.get('url') + '/auth/'+constants.providerName+'/callback';

			passportOAuth.Strategy.prototype.userProfile = function(accessToken, done) {
				this._oauth2._useAuthorizationHeaderForGET = true;
				this._oauth2.get(constants.userRoute, accessToken, function(err, body, res) {
					if (err) { return done(new Error('failed to fetch user profile', err)); }

					try {
						var json = JSON.parse(body);
						EveAuth.parseUserReturn(json, function(err, profile) {
							if (err) return done(err);
							profile.provider = constants.providerName;

							done(null, profile);
						});
					} catch(e) {
						done(e);
					}
				});
			};

			opts.passReqToCallback = true;

			passport.use(constants.providerName, new passportOAuth(opts, function(req, token, secret, profile, done) {
				this._oauth2._useAuthorizationHeaderForGET = true;
				EveAuth.login({
					characterId: profile.characterId,
					handle: profile.characterName,
					email: profile.email,
					isAdmin: false
				}, function(err, user) {
					if (err) {
						return done(err);
					}

					EveAuth.updateProfile(user.uid, profile, function(err, result) {
						authenticationController.onSuccessfulLogin(req, user.uid);
						done(null, user);
					});
				});
			}));

			strategies.push({
				name: constants.providerName,
				url: '/auth/'+constants.providerName,
				callbackURL: '/auth/'+ constants.providerName +'/callback',
				icon: constants.icon,
				scope: (constants.scope || '').split(',')
			});
		}
		callback(null, strategies);
	};

	// Update the user profile when logging in
	EveAuth.updateProfile = function(uid, profile, callback) {
		async.waterfall([
			function (next) {
				User.setUserField(uid, 'fullname', profile.characterName, next);
			},
			function (next) {
				next();
			}
		], callback);
	};


	EveAuth.getUsers = function(users, callback) {
		try {
			users.forEach(function(user) {
				if (user) {
					async.waterfall([
						async.apply(User.getUserField, user.uid, 'eveCharacterId'),
						function(eveId, next) {
							if(eveId != null) {
								user.picture = getEveOnlineUrl(eveId);
							}
						}
					], function(err) {
						if (err) {
							winston.error('[sso-eve] Could not retrieve eve character id data for uid ' + user.uid + '. Error: ' + err);
							return callback(err);
						}

						callback(null, user);
					});
				}
			});
		} catch(ex) {
			return callback(ex);
		}
		return callback(null, users);
	};

	function getEveOnlineUrl(eveId) {
		return 'https://image.eveonline.com/Character/'+eveId+'_256.jpg';
	};

	EveAuth.listPictures = function(data, callback) {
		User.getUserFields(data.uid, ['eveCharacterId'], function(err, userData) {
			data.pictures.push({
				type: 'eve',
				url: getEveOnlineUrl(userData.eveCharacterId),
				text: 'EVE'
			});

			callback(null, data);
		});
	};

	EveAuth.getPicture = function(data, callback) {
		if (data.type === 'eve') {
			User.getUserFields(data.uid, ['eveCharacterId'], function(err, userData) {
				data.picture = getEveOnlineUrl(userData.eveCharacterId);
				callback(null, data);
			});
		} else {
			callback(null, data);
		}
	};

	EveAuth.parseUserReturn = function(data, callback) {
		var profile = {};
		profile.characterId = data.CharacterID;
		profile.characterName = data.CharacterName;
		profile.email = data.CharacterID + '@eveonline.com';


		callback(null, profile);
	}

	EveAuth.login = function(payload, callback) {
		EveAuth.getUidByCharacterId(payload.characterId, function(err, uid) {
			if(err) {
				return callback(err);
			}

			if (uid !== null) {
				// Existing User
				callback(null, {
					uid: uid
				});
			} else {
				// New User
				var success = function(uid) {
					// Save provider-specific information to the user
					User.setUserField(uid, 'eveCharacterId', payload.characterId);
					db.setObjectField('eveCharacterId:uid', payload.characterId, uid);

					callback(null, {
						uid: uid
					});
				};

				User.getUidByEmail(payload.email, function(err, uid) {
					if(err) {
						return callback(err);
					}

					if (!uid) {
						User.create({
							username: payload.handle,
							email: payload.email
						}, function(err, uid) {
							if(err) {
								return callback(err);
							}

							success(uid);
						});
					} else {
						success(uid); // Existing account -- merge
					}
				});
			}
		});
	};

	EveAuth.getUidByCharacterId = function(oAuthid, callback) {
		db.getObjectField('eveCharacterId:uid', oAuthid, function(err, uid) {
			if (err) {
				return callback(err);
			}
			callback(null, uid);
		});
	};

	EveAuth.deleteUserData = function(data, callback) {
		async.waterfall([
			async.apply(User.getUserField, data.uid, 'eveCharacterId'),
			function(oAuthIdToDelete, next) {
				db.deleteObjectField('eveCharacterId:uid', oAuthIdToDelete, next);
			}
		], function(err) {
			if (err) {
				winston.error('[sso-oauth] Could not remove eveCharacterId for uid ' + data.uid + '. Error: ' + err);
				return callback(err);
			}

			callback(null, data);
		});
	};

	// Hook: Add menu item to Social Authentication admin menu
	EveAuth.addMenuItem = function(nav, callback) {
		nav.authentication.push({
			'route' : constants.admin.route,
			'icon'  : constants.admin.icon,
			'name'  : constants.name
		});

		callback(null, nav);
	};

	// Load settings
	EveAuth.getSettings = function(callback) {
		if (EveAuth.settings) {
			return callback();
		}

		meta.settings.get('sso-eve', function(err, settings) {
			winston.verbose('[plugin-sso-eve] Loaded Settings');

			EveAuth.settings = settings;
			callback();
		});
	};

	EveAuth.load = function(application, callback) {
		if (!EveAuth.settings) {
			return EveAuth.getSettings(function() {
				EveAuth.load(application, callback);
			});
		}

		function renderAdmin(req, res) {
			res.render('admin/plugins/sso-eve', {
				callbackURL: nconf.get('url') + '/auth/eve/callback'
			});
		}

		application.router.get('/admin/plugins/sso-eve', application.middleware.admin.buildHeader, renderAdmin);
		application.router.get('/api/admin/plugins/sso-eve', renderAdmin);

		callback();
	};

	module.exports = EveAuth;
}(module));
