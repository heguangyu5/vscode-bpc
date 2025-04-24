const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function ensureBpcMiniConf(dir) {
	const miniConfPath = dir + '/bpc-mini.conf';
	if (fs.existsSync(miniConfPath)) {
		return true;
	}

	try {
		let conf = fs.readFileSync('/usr/local/etc/bpc.conf', {encoding: 'utf-8'});
		conf = conf.replace(/\n\(extensions php-std[^)]*/, '\n(extensions php-std');
		fs.writeFileSync(dir + '/bpc-mini.conf', conf);
		return true;
	} catch (err) {
		console.error(err.message);
		vscode.window.showErrorMessage('BPC: create bpc-mini.conf failed!');
		return false;
	}
}

const excludesLibs = ['php-std.heap', 'php-runtime.heap', 'php-skeleton.heap'];
const phpExts = ['.php', '.inc', '.phtml'];

function getBpcLibs() {
	return fs.readdirSync('/usr/local/lib')
				.filter(f => f.endsWith('.heap') && !excludesLibs.includes(f))
				.map(f => f.slice(0,-5));
}

function getSrcFiles(dir, cur) {
	let files = fs.readdirSync(dir, {recursive: true}).filter(f => f !== cur && phpExts.includes(path.extname(f)));
	files.unshift(cur);
	return files;
}

let terminal;
const ini = '-d display_errors=off -d log_errors=on -d memory_limit=1024M -d max_execution_time=-1';

// type: static, dynamic
function compileMini(type) {
	const activeDocuemntPath = vscode.window.activeTextEditor.document.uri.path;
	const activeDocuemntDir  = path.dirname(activeDocuemntPath);
	if (!ensureBpcMiniConf(activeDocuemntDir)) {
		return;
	}
	terminal.sendText('cd ' + activeDocuemntDir);
	let cmd = ['bpc -v -c bpc-mini.conf'];
	if (type === 'static') {
		cmd.push('--static');
	}
	cmd.push(ini, path.basename(activeDocuemntPath));
	terminal.sendText(cmd.join(' ') + ' && rm -rf .bpc-build-* md5.map');
	terminal.show();
}

// type: static, dynamic
function compileFull(type) {
	vscode.window.showQuickPick(getBpcLibs(), {
		canPickMany: true,
		ignoreFocusOut: true,
		title: '1/3: Select required extensions/libraries'
	}).then(function (libs) {
		let cmd = ['bpc -v -c bpc-mini.conf'];
		if (type === 'static') {
			cmd.push('--static');
		}
		cmd.push(ini);
		if (libs && libs.length > 0) {
			cmd.push(...libs.map(l => '-u ' + l));
		}
		const activeDocuemntPath = vscode.window.activeTextEditor.document.uri.path;
		const activeDocuemntDir  = path.dirname(activeDocuemntPath);
		const activeDocuemntName = path.basename(activeDocuemntPath);
		vscode.window.showQuickPick(getSrcFiles(activeDocuemntDir, activeDocuemntName), {
			canPickMany: true,
			ignoreFocusOut: true,
			title: '2/3: Select PHP files to include in compilation'
		}).then(function (files) {
			if (!files || files.length === 0) {
				vscode.window.showWarningMessage('BPC: compile abort! No files to compile.');
				return;
			}
			vscode.window.showInputBox({
				ignoreFocusOut: true,
				title: '3/3: Set output filename',
				value: path.basename(activeDocuemntName, path.extname(activeDocuemntName))
			}).then(function (output) {
				if (!output || output.length === 0) {
					vscode.window.showWarningMessage('BPC: compile abort! Output filename not set.');
					return;
				}
				if (!ensureBpcMiniConf(activeDocuemntDir)) {
					return;
				}
				terminal.sendText('cd ' + activeDocuemntDir);
				cmd.push('-o ' + output);
				cmd.push(...files);
				terminal.sendText(cmd.join(' ') + ' && rm -rf .bpc-build-* md5.map');
				terminal.show();
			})
		})
	});
}

function activate(context) {

	if (!fs.existsSync('/usr/local/etc/bpc.conf')) {
		vscode.window.showErrorMessage('BPC not installed!');
		return;
	}

	terminal = vscode.window.createTerminal("BPC Terminal");

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-bpc.compile-static-mini', function () {
			compileMini('static');
		}),
		vscode.commands.registerCommand('vscode-bpc.compile-dynamic-mini', function () {
			compileMini('dynamic');
		}),
		vscode.commands.registerCommand('vscode-bpc.compile-static-configurable', function () {
			compileFull('static');
		}),
		vscode.commands.registerCommand('vscode-bpc.compile-dynamic-configurable', function () {
			compileFull('dynamic')
		})
	);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
