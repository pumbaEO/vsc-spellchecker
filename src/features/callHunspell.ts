"use strict";
import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
import { SpellProblem } from "./spellProvider"
let Spellchecker = require("hunspell-spellchecker");

//https://github.com/wooorm/dictionaries/archive/master.zip

export class HunSpeller{
    private extensionPath: string;
    private dictionariesPath: string;
    private loadedDictonary;
    private spellchecker;
    private checkedWords;
    private camelCaseRe: RegExp;
    private camelWordRe: RegExp;
    private checkStatistic;
    private checkedWordsCount: number;

    constructor(){
        this.checkedWords = {};
        this.checkedWordsCount = 0
        this.camelCaseRe = /(?!(^|[A-ZА-ЯЁІЄҐЇ]))(?=[A-ZА-ЯЁІЄҐЇ])|(?!^)(?=[A-ZА-ЯЁІЄҐЇ][a-zа-яёієїґ])/g;
        this.loadedDictonary = {};
        this.camelWordRe =  new RegExp('([А-ЯA-Z])([a-zа-я]*)', '');
        this.checkStatistic = {};
        this.setDictonaryPath("");
        
    }

    public setExtensionPath(extPath: string){
        this.extensionPath = extPath;
    }

    public getExtensionPath(): string {
        return this.extensionPath;
    }

    public setDictonaryPath(dicPath: string = ""){
        this.dictionariesPath = dicPath;
    }

    private getDictonaryPath(): string {
        if (this.dictionariesPath.length == 0) {
            return path.resolve(path.join(this.getExtensionPath(), ".", "dictionaries"));
        } else {
            return this.dictionariesPath;
        }
        
    }

    private joinWord(word: string): string[]{
        let words: string[] = word.split(this.camelCaseRe);
        let temp = [];
        for(let i of words){
            if (i){
                let match = null;
                if ((match = this.camelWordRe.exec(i))!=null){
                    temp.push(match[0]);
                } else {
                    temp.push(i);
                }
            }
            //i && temp.push(i); // copy each non-empty value to the 'temp' array
        }
        
        words = temp;
        
        return words;
    }

    private loadDictonary(language: string){
        let sc = this.loadedDictonary[language];
        let startTime = new Date().getTime();
        if (!sc) {
            try {
                sc = new Spellchecker();

                let fileAff = path.resolve(this.getDictonaryPath(), language, "index.aff");
                let fileDic = path.resolve(this.getDictonaryPath(), language, "index.dic");
                let DICT = sc.parse(
                {
                    aff: fs.readFileSync( fileAff ),
                    dic: fs.readFileSync( fileDic )
                });
                sc.use(DICT);
                this.loadedDictonary[language]=sc;
                this.checkStatistic[language]=0;
        
            } catch (e) {
                sc = undefined;
                this.loadedDictonary[language] = sc;
                //show error
                let message = "error load "+language + " "+e.message;
                vscode.window.showErrorMessage(message).then((selection )=>{
                    //if(error.label && error.label === selection && error.openUrl){
                    //    commands.executeCommand('vscode.open', error.openUrl);
                    //}
                });
                // rethrow to disrupt the chain.
                //throw error;
                console.error(e);
            }
            let currTime = new Date().getTime();
            let seconds: number = Math.floor( ( currTime - startTime ) / 1000 );
            console.log("loaded "+language + " time:"+seconds);
        }
        return sc;
    }

    private addStatistic(language){
        if (!this.checkStatistic[language]){
            return;
        }
        this.checkStatistic[language]= this.checkStatistic[language]+1;
    }

    private async sortStatisic(language: string[]){
        let temp = [];
        let countMax = 0;
        for (var i of language){
            if (!this.checkStatistic[i]){
                this.checkStatistic[i]=0;
            } 
            if (this.checkStatistic[i]>countMax){
                temp.unshift(i);
                countMax = this.checkStatistic[i];
            } else {
                temp.push(i);
            }
        }
        //conole.log(temp)
        if (temp.length > 0 && language.length > 0 && temp[0] !== language[0]){
            console.log("sorted language "+temp[0] + " old "+language[0]);
        }
        return temp;
    }
    public getSuggestions(word: string, language: string[]){
        let suggestions: string[] = new Array();
        let checkedWord = this.checkedWords[word.toLowerCase()];
        if (checkedWord["suggest"].length > 0) {
            return checkedWord["suggest"];
        }
        
        for (let index = 0; index < language.length; index++){
            let element = language[index];
            let sc = this.loadDictonary(element);
            if (!sc){
                //console.error("not found dictionary");
                continue;
            }
            if (!sc.check(word)){
                let suggest: string[] = sc.suggest(word, 3);
                for (let x = 0; x < suggest.length; x++){
                    suggestions.push(suggest[x]);
                }
            }
        }
        checkedWord["suggest"] = suggestions;
        this.checkedWords[word.toLowerCase()] = checkedWord;
        return suggestions;
    }

    public async checkWord(word: string, language: string[], addsuggest: boolean = false) {
        
        let checkedWord = this.checkedWords[word.toLowerCase()];
        if (checkedWord){
            if (addsuggest) {
                if (checkedWord["suggest"].length > 0) {
                    return checkedWord;
                }
            } else {
                return checkedWord;
            }
        }
        let result = {"check": true, "suggest": []};

        for (var index = 0; index < language.length; index++) {
            var element = language[index];
            //let startTime = new Date().getTime();

            let sc = await this.loadDictonary(element);
            if (!sc){
                continue;
            }
            
            if (!sc.check(word)){
                result["check"] = false;
                if (word.length < 50 && addsuggest) {
                    let suggest: string[] = sc.suggest( word );
                    for (let index of suggest){
                        result["suggest"].push(index);
                    }
                    //result["suggest"] = sc.suggest( word );
                }
            } else {
                this.addStatistic(language);
                index = language.length;
                result["check"] = true;
                result["suggest"] = [];
            }
        }
        
        this.checkedWords[word.toLowerCase()] = result;
        this.checkedWordsCount++;
        if (this.checkedWords > 10000){
            this.checkedWords = {};
            this.checkedWordsCount = 0;
        }
        return result;
    }

    public async check(language: string[], textoriginal: string, camelCase: boolean = false, linetoskip: number = 0) {
        let problems: SpellProblem[] = [];
        let languageSorted: string[] = await this.sortStatisic(language);
        let startTime = new Date().getTime();
        let lastSeconds: number = 0;

        textoriginal = textoriginal.replace( /\r?\n/g, '\n' );
        let text: string = textoriginal;
        text = text.replace( /[`\'\"!#$%&()*+,.\/:;<=>?@\[\]\\^_{|}\n\r\-~]/g, ' ' );
        let lines = textoriginal.split( '\n' );

        let lastposition = 0;
        let position = 0;
        let linenumber = 0;
        let colnumber = 0;
        let lastline = 0;

        for (var index = 0; index < lines.length; index++) {
            var line = lines[index];
            let tokens = line.split( ' ' );
            for (let i in tokens ){
                let token: string = tokens[i];
                if (token.length < 4){
                    continue;
                }
                let words: string[] = [token];
                if (camelCase){
                    words = this.joinWord(token);
                }

                for (var x = 0; x < words.length; x++) {
                    let word = words[x];
                    if (word == undefined || word.length < 4) {
                        continue;
                    }
                    let result = await this.checkWord(word, languageSorted);
                    if (!result["check"]){
                        lastposition = 0;
                        position = line.indexOf(word, lastposition);
                        while(position > 0) {
                            problems.push({
                                error: word,
                                preContext: token,
                                startLine: index+linetoskip,
                                startChar: position,
                                endLine: index + linetoskip,
                                endChar: position + word.length,
                                type: "Error",
                                message: "spell ["+word+"] - suggest ["+result["suggest"].join(",") + "]",
                                suggestions: result["suggest"],
                            });
                            lastposition = position + word.length;
                            position = line.indexOf(word, lastposition);
                        }
                    }
                }
            }           
        }
        return problems;
    }
}