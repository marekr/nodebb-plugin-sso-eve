<div class="row">
	<div class="col-sm-2 col-xs-12 settings-header">EVE SSO</div>
	<div class="col-sm-10 col-xs-12">
		<div class="alert alert-info">
			<p>
				Register a new <strong>EVE Online Application</strong> via 
				<a href="https://developers.eveonline.com/applications">Developer Applications</a> and then paste
				your application details here.
			</p>
		</div>
		<form class="sso-eve-settings">
			<div class="form-group">
				<label for="id">Client ID</label>
				<input type="text" name="clientId" title="Client ID" class="form-control" placeholder="Client ID">
			</div>
			<div class="form-group">
				<label for="secret">Client Secret</label>
				<input type="text" name="clientSecret" title="Client Secret" class="form-control" placeholder="Client Secret" />
			</div>
			<div class="form-group alert alert-warning">
				<label for="callback">Your NodeBB&apos;s "Authorization callback URL"</label>
				<input type="text" id="callback" title="Authorization callback URL" class="form-control" value="{callbackURL}" readonly />
				<p class="help-block">
					Ensure that this value is set in your GitHub application&apos;s settings
				</p>
			</div>
		</form>
	</div>
</div>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>