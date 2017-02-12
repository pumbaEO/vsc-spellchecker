'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { HunSpeller } from "./features/callHunspell"
import * as path from 'path';
import * as requirements from './features/requirements'
import { Delayer } from './features/delayer';

let DEBUG: boolean = false;

interface SpellSettingsIgnore {
    ignoreWordsList: string[];
    ignoreRegExp: string[];
}

interface SpellSettings{
    language: string[],
    languageIDs: string[];
}
export interface SpellProblem {
    error: string;
    preContext: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    type: string;
    message: string;
    suggestions: string[];
}

interface Map<V> {
    [key: string]: V;
}

export class Global{
    
    public static addToDictionaryCmdId: string = 'vsc-spellchecker.addToDictionary';
    public static fixOnSuggestionCmdId: string = 'vsc-spellchecker.fixOnSuggestion';
    public static changeLanguageCmdId: string = 'vsc-spellchecker.changeLanguage';
    public static spellCurrentTextDocumentCmdId: string = 'vsc-spellchecker.spellCurrent';


    private problems: SpellProblem[] = [];
    public settingsIgnore: SpellSettingsIgnore;
    public settings: SpellSettings;
    private diagnosticMap = {};
    private spellDiagnostics: vscode.DiagnosticCollection;
    private spellDiagnosticsOnLine: vscode.DiagnosticCollection;
    private CONFIGFOLDER = "/.vscode";
    private CONFIGFILE = "/spell.json";
    private statusBarItem: vscode.StatusBarItem;
    private IsDisabled: boolean = false;

    private addToDictionaryCmd: vscode.Disposable;
    private fixOnSuggestionCmd: vscode.Disposable;
    private changeLanguageCmd: vscode.Disposable;
    private spellCurrentTextDocumentCmd: vscode.Disposable;
    public hunSpell: HunSpeller;
    private validationDelayer: Map<Delayer<void>> = Object.create(null); // key is the URI of the document

    constructor() {
        this.settingsIgnore = this.readSettings();
    }

    public activate(context: vscode.ExtensionContext){
        if (DEBUG) console.log("Spell and Grammar checker active...");
        let subscriptions: vscode.Disposable[] = context.subscriptions;
        let toggleCmd: vscode.Disposable;
        const config = vscode.workspace.getConfiguration();
        this.settings = {
            language: config.get<Array<string>>('vsc-spellchecker.language', []),
            languageIDs: config.get<Array<string>>('vsc-spellchecker.languageIDs',[])
        }
        let dictionariesRootPath = config.get<string>('vsc-spellchecker.dictionariesRootPath',null); 
    

        vscode.commands.registerCommand("toggleSpell", this.toggleSpell.bind(this));
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.command = "toggleSpell";
        this.statusBarItem.tooltip = "Toggle Spell Checker On/Off for supported files";
        this.statusBarItem.show();

        this.hunSpell = new HunSpeller();
        this.hunSpell.setExtensionPath(context.extensionPath);
        this.hunSpell.setDictonaryPath(this.readDictionaryConfig());

        this.addToDictionaryCmd = vscode.commands.registerCommand(Global.addToDictionaryCmdId, this.addToDictionary.bind(this));
        this.fixOnSuggestionCmd = vscode.commands.registerCommand(Global.fixOnSuggestionCmdId, this.fixOnSuggestion.bind(this));
        this.changeLanguageCmd = vscode.commands.registerCommand(Global.changeLanguageCmdId, this.changeLanguage.bind(this));
        this.spellCurrentTextDocumentCmd = vscode.commands.registerCommand(Global.spellCurrentTextDocumentCmdId, this.TriggerActiveTextEditorDiagnostics.bind(this));

        subscriptions.push(this.addToDictionaryCmd);
        subscriptions.push(this.fixOnSuggestionCmd);
        subscriptions.push(this.changeLanguageCmd);
        subscriptions.push(this.spellCurrentTextDocumentCmd);

        this.spellDiagnostics = vscode.languages.createDiagnosticCollection('spellchecker');

        vscode.workspace.onDidOpenTextDocument(this.TriggerDiagnostics, this, subscriptions)
        vscode.workspace.onDidChangeTextDocument(this.TriggerDiffDiagnostics, this, subscriptions)
        vscode.workspace.onDidSaveTextDocument(this.TriggerDiagnostics, this, subscriptions)
        vscode.workspace.onDidCloseTextDocument((textDocument) => {
            this.spellDiagnostics.delete(textDocument.uri);
        }, null, subscriptions);

       if (vscode.window.activeTextEditor) {
            this.TriggerDiagnostics(vscode.window.activeTextEditor.document);
        }
    }

    private readDictionaryConfig() : string {
        const config = vscode.workspace.getConfiguration();
        let dictionariesRootPath = config.get<string>('vsc-spellchecker.dictionariesRootPath',null); 
        if (dictionariesRootPath.length === 0){
            dictionariesRootPath = path.resolve(__dirname, '../../dictionaries');
        }
        return dictionariesRootPath;
    }

    public toggleSpell() {
        if (this.IsDisabled) {
            this.IsDisabled = false;
            if (vscode.window.activeTextEditor){
                this.TriggerDiagnostics(vscode.window.activeTextEditor.document);
            }
        } else {
            this.IsDisabled = true;
            if(DEBUG) console.log("Clearing diagnostics as Spell was disabled.")
            this.spellDiagnostics.clear();
        }
        this.updateStatus();
    }

    public updateStatus() {
        if (this.IsDisabled) {
            this.statusBarItem.text = `$(book) Spell Disabled [${this.settings.language}]`;
            this.statusBarItem.color = "orange";
        } else {
            this.statusBarItem.text = `$(book) Spell Enabled [${this.settings.language}]`;
            this.statusBarItem.color = "white";
        }
    }

    public async TriggerDiagnostics(document: vscode.TextDocument){
        // Do nothing if the doc type is not one we should test
        if (this.settings.languageIDs.indexOf(document.languageId) === -1) {
            // if(DEBUG) console.log("Hiding status due to language ID [" + document.languageId + "]");
            this.statusBarItem.hide();
            return;
        } else {
            this.updateStatus();
            // statusBarItem.show();
        }

        if (this.IsDisabled) return;
        //await this.resolveRequirements();

        this.CreateDiagnostics(document);

    }

    public TriggerDiffDiagnostics(event: vscode.TextDocumentChangeEvent) {
        let document = event.document;
        let d = this.validationDelayer[document.uri.toString()];

        //return;
        
        if (!d) {
            d = new Delayer<any>(1000);
            this.validationDelayer[document.uri.toString()] = d;
        }
        if (event.contentChanges.length > 0) {
            let i = event.contentChanges[0];
            let textLine = document.lineAt(i.range.end);
            d.trigger(() => {
                this.CreateDiagnosticsForText(document, textLine.text, i.range.end.line);
                delete this.validationDelayer[document.uri.toString()];
            });
        }
    }

    private changeLanguage(){
        let items: vscode.QuickPickItem[] = [];
        items.push({label: "uk_UA", description: "uk_UA"});
        items.push({label: "ru_RU", description: "ru_RU"})
        items.push({label: "en_US", description: "en_US"});
        
        // replace the text with the selection
        vscode.window.showQuickPick(items).then((selection) => {
            if (!selection) return;

            this.settings.language = [selection.description];
            if (DEBUG) console.log("Attempting to change to: " + this.settings.language);
            this.writeSettings();
            vscode.window.showInformationMessage("To start checking in " + this.settings.language[0]
                + " reload window by pressing 'F1' + 'Reload Window'.")
        }
        );
    }

    private async TriggerActiveTextEditorDiagnostics(){
        if (vscode.window.activeTextEditor) {
            //await this.resolveRequirements();
            return this.CreateDiagnostics(vscode.window.activeTextEditor.document);
        }
    }

    private readSettings(): SpellSettingsIgnore {
        let cfg: any = readJsonFile(vscode.workspace.rootPath + this.CONFIGFOLDER + this.CONFIGFILE);

        function readJsonFile(file): any {
            let cfg = {};
            try {
                cfg = JSON.parse(fs.readFileSync(file).toString());
                if (DEBUG) console.log("Settings read from: " + file)
            }
            catch (err) {
                if (DEBUG) console.log("Default Settings")
                cfg = JSON.parse('{\
                                "version": "0.1.1", \
                                "ignoreWordsList": [], \
                                "ignoreRegExp": [ \
                                    "/\\\\(.*\\\\.(jpg|jpeg|png|md|gif|JPG|JPEG|PNG|MD|GIF)\\\\)/g", \
                                    "/((http|https|ftp|git)\\\\S*)/g" \
                                 ]\
                              }');
            }

            //gracefully handle new fields
            if (cfg["languageIDs"] === undefined) cfg["languageIDs"] = ["markdown", "bsl", "feature"];
            if (cfg["language"] === undefined) cfg["language"] = ["uk_UA", "ru_RU", "en_US"];
            if (cfg["ignoreRegExp"] === undefined) cfg["ignoreRegExp"] = [];
            return cfg;
        }

        return {
            ignoreWordsList: cfg.ignoreWordsList,
            ignoreRegExp: cfg.ignoreRegExp,
        }
    }

    private writeSettings(): void {
        try {
            fs.mkdirSync(vscode.workspace.rootPath + this.CONFIGFOLDER);
            if (DEBUG) console.log("Created new settings folder: " + this.CONFIGFOLDER);
            vscode.window.showInformationMessage("SPELL: Created a new settings file: " + this.CONFIGFOLDER + this.CONFIGFILE)
        } catch (e) {
            if (DEBUG) console.log("Folder for settings existed: " + this.CONFIGFOLDER);
        }
        fs.writeFileSync(vscode.workspace.rootPath + this.CONFIGFOLDER + this.CONFIGFILE, JSON.stringify(this.settingsIgnore, null, 2));
        if (DEBUG) console.log("Settings written to: " + this.CONFIGFILE);
    }

    public dispose(): void {
        this.spellDiagnostics.clear();
        this.spellDiagnostics.dispose();
        this.spellDiagnosticsOnLine.clear();
        this.spellDiagnosticsOnLine.dispose()
        this.statusBarItem.dispose();
        this.addToDictionaryCmd.dispose();
        this.fixOnSuggestionCmd.dispose();
        this.changeLanguageCmd.dispose();
    }


    private addToDictionary(document: vscode.TextDocument, word: string): any {
        if (DEBUG) console.log("Attempting to add to dictionary: " + word)

        // only add if it's not already there
        if (this.settingsIgnore.ignoreWordsList.indexOf(word) === -1) {
            if (DEBUG) console.log("Word is not found in current dictionary -> adding")
            this.settingsIgnore.ignoreWordsList.push(word);
            this.writeSettings();
        }
        //this.TriggerDiagnostics(document);
    }

    private fixOnSuggestion(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, error: string, suggestion: string): any {
        if (DEBUG) console.log("Attempting to fix file:" + document.uri.toString());
        let docError: string = document.getText(diagnostic.range);

        if (error == docError) {
            // Remove diagnostic from list
            let diagnostics: vscode.Diagnostic[] = this.diagnosticMap[document.uri.toString()];
            let index: number = diagnostics.indexOf(diagnostic);

            diagnostics.splice(index, 1);

            // Update with new diagnostics
            this.diagnosticMap[document.uri.toString()] = diagnostics;
            this.spellDiagnostics.set(document.uri, diagnostics);

            // Insert the new text			
            let edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, suggestion);
            return vscode.workspace.applyEdit(edit);
        }
        else {
            vscode.window.showErrorMessage('The suggestion was not applied because it is out of date.');
        }
    }

    private removeUnwantedText(content: string): string {
        let match;
        let expressions = this.settingsIgnore.ignoreRegExp;

        for (let x = 0; x < expressions.length; x++) {
            // Convert the JSON of regExp Strings into a real RegExp
            let flags = expressions[x].replace(/.*\/([gimy]*)$/, '$1');
            let pattern = expressions[x].replace(new RegExp('^/(.*?)/' + flags + '$'), '$1');

            pattern = pattern.replace(/\\\\/g, "\\");
            let regex = new RegExp(pattern, flags);

            if(DEBUG) console.log("Ignoreing ["+ expressions[x] +"]");

            match = content.match(regex);
            if (match !== null) {
                if(DEBUG) console.log("Found [" + match.length + "] matches for removal");
                // look for a multi line match and build enough lines into the replacement
                for (let i = 0; i < match.length; i++) {
                    let spaces: string;
                    let lines = match[i].split("\n").length;

                    if (lines > 1) {
                        spaces = new Array(lines).join("\n");
                    } else {
                        spaces = new Array(match[i].length + 1).join(" ");
                    }
                    content = content.replace(match[i], spaces);
                }
            }
        }
        return content;
    }

    public CreateDiagnostics(document: vscode.TextDocument) {
        let docToCheck = document.getText();

        if (DEBUG) console.log("Starting new check on: " + document.fileName + " [" + document.languageId + "]");
        //});
        return this.CreateDiagnosticsForText(document, docToCheck);
    }

    public async CreateDiagnosticsForText(document: vscode.TextDocument, text: string, lineStart: number = 0) {
        let diagnostics: vscode.Diagnostic[] = [];
        let problems = [];
        // removeUnwantedText before processing the spell checker ignores a lot of chars so removing them aids in problem matching
        let docToCheck = this.removeUnwantedText(text);
        docToCheck = docToCheck.replace(/[\'`\"!#$%&()*+,.\/:;<=>?@\[\]\\^_{|}]/g, " ");

        problems = await this.hunSpell.check(this.settings.language, docToCheck, true, lineStart);
        for (let x = 0; x < problems.length; x++) {
            let problem = problems[x];

            if (this.settingsIgnore.ignoreWordsList.indexOf(problem.error) === -1) {
                    let lineRange = new vscode.Range(problem.startLine, problem.startChar, problem.endLine, problem.endChar);
                    let loc = new vscode.Location(document.uri, lineRange);

                    let diag = new vscode.Diagnostic(lineRange, problem.message, vscode.DiagnosticSeverity.Warning);
                    diagnostics.push(diag);
            }
        }
        
        if (lineStart > 0){
            let olddiagnostics = this.diagnosticMap[document.uri.toString()];
            if (olddiagnostics){
                olddiagnostics.forEach(diagnostic => {
                    diagnostics.push(diagnostic);
                });
            }
            this.spellDiagnostics.set(document.uri, diagnostics);
        } else {
            this.spellDiagnostics.set(document.uri, diagnostics);
            this.diagnosticMap[document.uri.toString()] = diagnostics;
        }
        return diagnostics;
    }

    public async resolveRequirements() {
        return requirements.resolveRequirements().catch(error => {
                vscode.window.showErrorMessage(error.message, error.label).then((selection )=>{
                    if(error.label && error.label === selection && error.openUrl){
                        vscode.commands.executeCommand('vscode.open', error.openUrl);
                    }
            });
            // rethrow to disrupt the chain.
            throw error;
        })
        .then(requirements => {

        })
    }



}
