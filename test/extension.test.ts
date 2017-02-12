import * as assert from 'assert';
import * as vscode from 'vscode';
import * as spellchecker from '../src/extension';
import * as path from "path";
import { addText, fixturePath, mAsync, newTextDocument } from "./helpers";
import { Global } from '../src/global'; 

let textDocument: vscode.TextDocument;

suite('SpellChecker Language Extension', () => {

	test('should be present', () => {
		assert.ok(vscode.extensions.getExtension('pumbaEO.vsc-spellchecker'));
	});

	test('should activate', function (done) {
		this.timeout(1 * 60 * 1000);
		return vscode.extensions.getExtension('pumbaEO.vsc-spellchecker').activate().then((api) => {
			done();
		});
	});

	test('should register all spell commands', function(done){
		return vscode.commands.getCommands(true).then((commands) => 
		{
			let spellCmds = commands.filter(function (value) {
				return 'vsc-spellchecker.changeLanguage' === value ||
						'vsc-spellchecker.spellCurrent' === value;
			});
			assert.ok(spellCmds.length === 2, 'missing spell commands');
			done();
		});
	});

	test('should spell document', mAsync(async (done) => {
        const uriFile = vscode.Uri.file(
            path.join(fixturePath, "empty.txt")
        );
        textDocument = await newTextDocument(uriFile);
		await addText("swiming\n");
		await addText("swimming");
		
		const position = new vscode.Position(1, 3);
        const errors = await vscode.commands.executeCommand<vscode.DiagnosticCollection[]>(
				Global.spellCurrentTextDocumentCmdId);

		assert.ok(errors.length > 0, 'missing errors for swiming');
       
	}));
});