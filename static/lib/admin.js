define('admin/plugins/sso-eve', ['settings'], function(Settings) {
	'use strict';
	/* globals $, app, socket, require */

	var ACP = {};

	ACP.init = function() {
		Settings.load('sso-eve', $('.sso-eve-settings'));

		$('#save').on('click', function() {
			Settings.save('sso-eve', $('.sso-eve-settings'), function() {
				app.alert({
					type: 'success',
					alert_id: 'sso-eve-saved',
					title: 'Settings Saved',
					message: 'Please reload your NodeBB to apply these settings',
					clickfn: function() {
						socket.emit('admin.reload');
					}
				});
			});
		});
	};

	return ACP;
});