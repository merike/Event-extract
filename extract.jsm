/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Event Extractor code.
 *
 * The Initial Developer of the Original Code is
 * Merike Sell.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ["extractor"];
var marker = "--MARK--";

var extractor = {
  collected: [],
  dayStart: 6,
  bundleDir: "",
  bundle: "",
  fallbackLocale: "",
  aConsoleService: Components.classes["@mozilla.org/consoleservice;1"]
                  .getService(Components.interfaces.nsIConsoleService),
  
  cleanup: function cleanup(email) {
    // remove Date: and Sent: lines
    email = email.replace(/^Date:.+$/m, "");
    email = email.replace(/^Sent:.+$/m, "");
    email = email.replace(/^Saatmisaeg:.+$/m, "");
    
    // XXX remove earlier correspondence, for now
    // remove line preceeding quoted message and first line of the quote
    email = email.replace(/\r?\n[^>].*\r?\n>+.*$/m, "");
    // remove the rest of quoted content
    email = email.replace(/^>+.*$/gm, "");
    
    // remove empty lines
    email = email.replace(/<br ?\/?>/gm, "");
    email = email.replace(/^\s[ \t]*$/gm, "");
        
    // remove standard signature
    email = email.replace(/\r?\n-- \r?\n[\S\s]+$/, "");
    
    // XXX remove timezone info, for now
    email = email.replace(/gmt[+-]\d{2}:\d{2}/gi, "");
    return email;
  },
  
  setBundle: function setBundle(dir, fallbackLocale) {
    this.bundleDir = dir;
    this.fallbackLocale = fallbackLocale;
  },
  
  checkBundle: function checkBundle(locale) {
    let service = Components.classes["@mozilla.org/intl/stringbundle;1"]
                 .getService(Components.interfaces.nsIStringBundleService);
    let bundle = service.createBundle(this.bundleDir + "extract_" + locale + ".properties");
    
    try {
      bundle.formatStringFromName("today", [], 0);
      return true;
    } catch (ex) {
      return false;
    }
  },
  
  avgCharCode: function avgCharCode(email) {
    let sum = 0;
    let cnt = 0;
    
    for (let i = 0; i < email.length; i++) {
      let ch = email.charAt(i);
        if (/[^a-zA-Z0-9 .,;:'"()\[\]\r\n\t%?/\-]/.exec(ch)) {
          sum += ch.charCodeAt();
          cnt++;
        }
    }
    this.aConsoleService.logStringMessage("Average charcode: " + sum/cnt);
    dump("Average charcode: " + sum/cnt + "\n");
    return sum/cnt;
  },
  
  guessLanguage: function guessLanguage(email) {
    let spellclass = "@mozilla.org/spellchecker/engine;1";
    let gSpellCheckEngine = Components.classes[spellclass]
                       .createInstance(Components.interfaces.mozISpellCheckingEngine);
    let arr = {};
    let cnt = {};
    let words = email.split(/\s+/);
    let most = 0;
    let mostLocale;
    let patterns;
    
    gSpellCheckEngine.getDictionaryList(arr, cnt);
    let dicts = arr["value"]
    
    for (let dict in dicts) {
      if (this.checkBundle(dicts[dict])) {
        let t1 = (new Date()).getTime();
        gSpellCheckEngine.dictionary = dicts[dict];
        let dur = (new Date()).getTime() - t1;
        dump("Loading " + dicts[dict] + " dictionary took " + dur + "ms\n");
        this.aConsoleService.logStringMessage("Loading " + dicts[dict] + " dictionary took " + dur + "ms\n");
        patterns = dicts[dict];
      } else if (this.checkBundle(dicts[dict].substring(0, 2))) {
        let t1 = (new Date()).getTime();
        gSpellCheckEngine.dictionary = dicts[dict];
        let dur = (new Date()).getTime() - t1;
        dump("Loading " + dicts[dict] + " dictionary took " + dur + "ms\n");
        this.aConsoleService.logStringMessage("Loading " + dicts[dict] + " dictionary took " + dur + "ms\n");
        patterns = dicts[dict].substring(0, 2);
      } else {
        dump("Dictionary present, rules missing: " + dicts[dict]);
        this.aConsoleService.logStringMessage("Dictionary present, rules missing: " + dicts[dict]);
        continue;
      }
      
      let correct = 0;
      let total = 0;
      for (let word in words) {
        words[word] = words[word].replace(/[()\d,;:?!#\.]/g, "");
        if (words[word].length >= 2) {
          total++;
          if (gSpellCheckEngine.check(words[word]))
            correct++;
        }
      }
      
      let percentage = correct/total;
      dump(dicts[dict] + " " + percentage + "\n");
      this.aConsoleService.logStringMessage(dicts[dict] + " " + percentage);
      
      if (percentage > 0.5 && percentage > most) {
        mostLocale = patterns;
        most = percentage;
      }
    }
    
    let service = Components.classes["@mozilla.org/intl/stringbundle;1"]
                 .getService(Components.interfaces.nsIStringBundleService);
    let avgCharCode = this.avgCharCode(email);
                 
    if (avgCharCode > 24000 && avgCharCode < 32000) {
      dump("Using zh-TW patterns\n");
      this.aConsoleService.logStringMessage("Using zh-TW patterns");
      this.bundle = service.createBundle(this.bundleDir + "extract_zh-TW.properties");
    } else if (avgCharCode > 14000 && avgCharCode < 24000) {
      dump("Using ja patterns\n");
      this.aConsoleService.logStringMessage("Using ja patterns");
      this.bundle = service.createBundle(this.bundleDir + "extract_ja.properties");
    } else if (avgCharCode > 1000 && avgCharCode < 1200) {
      dump("Using ru patterns\n");
      this.aConsoleService.logStringMessage("Using ru patterns");
      this.bundle = service.createBundle(this.bundleDir + "extract_ru.properties");
    } else if (most > 0) {
      dump("Using " + mostLocale + " patterns based on dictionary\n");
      this.aConsoleService.logStringMessage("Using " + mostLocale + " patterns  based on dictionary");
      this.bundle = service.createBundle(this.bundleDir + "extract_" + mostLocale + ".properties");
    } else if (this.checkBundle(this.fallbackLocale)) {
      dump("Falling back to " + this.fallbackLocale + "\n");
      this.aConsoleService.logStringMessage("Falling back to " + this.fallbackLocale);
      this.bundle = service.createBundle(this.bundleDir + "extract_" + this.fallbackLocale + ".properties");
    } else if (this.checkBundle(this.fallbackLocale.substring(0, 2))) {
      this.fallbackLocale = this.fallbackLocale.substring(0, 2);
      dump("Falling back to " + this.fallbackLocale + "\n");
      this.aConsoleService.logStringMessage("Falling back to " + this.fallbackLocale);
      this.bundle = service.createBundle(this.bundleDir + "extract_" + this.fallbackLocale + ".properties");
    } else {
      dump("Using en-US\n");
      this.aConsoleService.logStringMessage("Using en-US");
      this.bundle = service.createBundle(this.bundleDir + "extract_en-US.properties");
    }
  },

  extract: function extract(email, now, dayStart) {
    let initial = {};
    let res;
    initial.year = now.getFullYear();
    initial.month = now.getMonth() + 1;
    initial.day = now.getDate();
    initial.hour = now.getHours();
    initial.minute = now.getMinutes();
    this.collected = [];
    if (dayStart != undefined)
      this.dayStart = dayStart;
    
    this.collected.push({year: initial.year,
                         month: initial.month,
                         day: initial.day});
    
    email = this.cleanup(email);
    
    this.aConsoleService.logStringMessage("After removing correspondence: \n" + email);
    
    this.guessLanguage(email);
    
    let re = new RegExp(this.getAlternatives(this.bundle, "today"), "ig");
    if ((res = re.exec(email)) != null) {
      if (!this.restrictChars(res, email)) {
        let item = new Date(now.getTime());
        this.collected.push({year: item.getFullYear(),
                             month: item.getMonth() + 1,
                             day: item.getDate(),
                             start: res.index,
                             end: res.index + res[0].length - 1,
                             str: res[0]
        });
      }
    }
    
    re = new RegExp(this.getAlternatives(this.bundle, "tomorrow"), "ig");
    if ((res = re.exec(email)) != null) {
      if (!this.restrictChars(res, email)) {
        let item = new Date(now.getTime() + 60 * 60 * 24 * 1000);
        this.collected.push({year: item.getFullYear(),
                             month: item.getMonth() + 1,
                             day: item.getDate(),
                             start: res.index,
                             end: res.index + res[0].length - 1,
                             str: res[0]
        });
      }
    }
    
    // day only
    var alts = this.getRepAlternatives(this.bundle, "ordinal.date", ["(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          if (this.isValidDay(res[1])) {
            let item = new Date(now.getTime());
            if (now.getDate() > res[1]) {
              // find next nth date
              while (true) {
                item.setDate(item.getDate() + 1);
                if (item.getMonth() != now.getMonth() &&
                  item.getDate() == res[1])
                  break;
              }
            }
            this.collected.push({year: item.getFullYear(),
                                 month: item.getMonth() + 1,
                                 day: res[1],
                                 start: res.index,
                                 end: res.index + res[0].length - 1,
                                 ambiguous: true,
                                 str: res[0]
            });
          }
        }
      }
    }
    
    // weekday
    let days = [];
    for (let i = 0; i < 7; i++) {
      days[i] = this.getAlternatives(this.bundle, "weekday." + i);
      let re = new RegExp(days[i], "ig");
      res = re.exec(email);
      if (res) {
        if (!this.restrictChars(res, email)) {
          let date = new Date();
          date.setDate(now.getDate());
          date.setMonth(now.getMonth());
          date.setYear(now.getFullYear());

          let diff = (i - date.getDay() + 7) % 7;
          date.setDate(date.getDate() + diff);
          
          this.collected.push({year: date.getFullYear(),
                              month: date.getMonth() + 1,
                              day: date.getDate(),
                              start: res.index,
                              end: res.index + res[0].length - 1,
                              ambiguous: true,
                              str: res[0]
          });
        }
      }
    }
    
    // time only
    re = new RegExp(this.getAlternatives(this.bundle, "noon"), "ig");
    if ((res = re.exec(email)) != null) {
      if (!this.restrictChars(res, email)) {
        this.collected.push({hour: 12,
                             minute: 0,
                             start: res.index,
                             end: res.index + res[0].length - 1,
                             str: res[0]
        });
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "hour.only", ["(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          if (this.isValidHour(res[1])) {
            this.collected.push({hour: this.normalizeHour(res[1]), minute: 0,
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            ambiguous: true,
                            str: res[0]
            });
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "hour.only.am", ["(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          if (res[1] == 12)
            res[1] = res[1] - 12;
          if (this.isValidHour(res[1])) {
            this.collected.push({hour: res[1], minute: 0,
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            ambiguous: true,
                            str: res[0]
            });
          }
        }
      }
    }
      
    alts = this.getRepAlternatives(this.bundle, "hour.only.pm", ["(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          if (res[1] != 12)
            res[1] = res[1] + 12;
          if (this.isValidHour(res[1])) {
            this.collected.push({hour: res[1], minute: 0,
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            ambiguous: true,
                            str: res[0]
            });
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "until.hour", ["(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          let guess = {};
          res[1] = parseInt(res[1], 10);
          
          if (this.isValidHour(res[1])) {
            guess.hour = this.normalizeHour(res[1]);
            guess.minute = 0;
          }
          
          guess.start = res.index;
          guess.end = res.index + res[0].length - 1;
          guess.ambiguous = true;
          guess.str = res[0];
          guess.endtime = true;
          
          this.collected.push(guess);
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "until.hour.minutes", ["(\\d{1,2})", "(\\d{2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          let guess = {};
            res[1] = parseInt(res[1], 10);
            res[2] = parseInt(res[2], 10);
            
            if (this.isValidHour(res[1]) && this.isValidMinute(res[1])) {
              guess.hour = this.normalizeHour(res[1]);
              guess.minute = res[2];
            }
            
            guess.start = res.index;
            guess.end = res.index + res[0].length - 1;
            guess.ambiguous = true;
            guess.str = res[0];
            guess.endtime = true;
            
            this.collected.push(guess);
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "until.hour.minutes.am", ["(\\d{1,2})", "(\\d{2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (res[1] == 12)
            res[1] = res[1] - 12;
          
          if (this.isValidHour(res[1]) && this.isValidMinute(res[2])) {
            this.collected.push({hour: res[1], minute: res[2],
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            str: res[0], endtime: true
            });
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "until.hour.minutes.pm", ["(\\d{1,2})", "(\\d{2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (res[1] != 12)
            res[1] = res[1] + 12;
          
          if (this.isValidHour(res[1]) && this.isValidMinute(res[2])) {
            this.collected.push({hour: res[1], minute: res[2],
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            str: res[0], endtime: true
            });
          }
        }
      }
    }
    
    // hour:minutes
    alts = this.getRepAlternatives(this.bundle, "hour.minutes", ["(\\d{1,2})","(\\d{2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (this.isValidHour(res[1]) && this.isValidMinute(res[2])) {
            this.collected.push({hour: this.normalizeHour(res[1]), minute: res[2],
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            str: res[0]
            });
          }
        }
      }
    }

    alts = this.getRepAlternatives(this.bundle, "hour.minutes.am", ["(\\d{1,2})", "(\\d{2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (res[1] == 12)
            res[1] = res[1] - 12;
          
          if (this.isValidHour(res[1]) && this.isValidMinute(res[2])) {
            this.collected.push({hour: res[1], minute: res[2],
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            str: res[0]
            });
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "hour.minutes.pm", ["(\\d{1,2})", "(\\d{2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (res[1] != 12)
            res[1] = res[1] + 12;
          
          if (this.isValidHour(res[1]) && this.isValidMinute(res[2])) {
            this.collected.push({hour: res[1], minute: res[2],
                            start: res.index,
                            end: res.index + res[0].length - 1,
                            str: res[0]
            });
          }
        }
      }
    }

    // month with day
    let months = [];
    for (let i = 0; i < 12; i++) {
      months[i] = this.getAlternatives(this.bundle, "month." + (i + 1));
    }
    // | is both used as pattern separator and within patterns
    // ignore those within patterns temporarily
    let allMonths = months.join(marker).replace("|", marker, "g");
    alts = this.getRepAlternatives(this.bundle, "monthname.day", ["(\\d{1,2})", "(" + allMonths + ")"]);
    for (var alt in alts) {
      let pattern = alts[alt].pattern.replace(marker, "|", "g");
      let positions = alts[alt].positions;

      let re = new RegExp(pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[positions[1]] = parseInt(res[positions[1]], 10);
          if (this.isValidDay(res[positions[1]])) {
            for (let i = 0; i < 12; i++) {
              let ms = months[i].unescape().split("|");
              if (ms.indexOf(res[positions[2]].toLowerCase()) != -1) {
                let year = now.getFullYear();
                let ref = new Date(now.getTime() - 60 * 60 * 24 * 1000);
                if (ref > new Date(year, i, res[positions[2]]))
                  year++;
                this.collected.push({year: year,
                                     month: i + 1,
                                     day: res[positions[1]],
                                     start: res.index,
                                     end: res.index + res[0].length - 1,
                                     str: res[0]
                });
                break;
              }
            }
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "month.day", ["(\\d{1,2})", "(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (this.isValidMonth(res[2]) && this.isValidDay(res[1])) {
            let guess = {};
            guess.year = now.getFullYear();
            guess.month = res[2];
            guess.day = res[1];
            guess.start = res.index;
            guess.end = res.index + res[0].length - 1;
            guess.str = res[0];
            
            if (this.isPastDate(guess, now)) {
              // find next such date
              let item = new Date(now.getTime());
              while (true) {
                item.setDate(item.getDate() + 1);
                if (item.getMonth() == res[2] - 1  &&
                  item.getDate() == res[1]) {
                    guess.year = item.getFullYear();
                    break;
                  }
              }
            }
            this.collected.push(guess);
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "until.monthname.date",
                              ["(\\d{1,2})", "(" + allMonths + ")"]);
    for (var alt in alts) {
      let pattern = alts[alt].pattern.replace(marker, "|", "g");
      let positions = alts[alt].positions;

      let re = new RegExp(pattern, "ig");
      
      while ((res = re.exec(email)) != null) {
        if (res) {
          res[positions[1]] = parseInt(res[positions[1]], 10);
          if (this.isValidDay(res[positions[1]])) {
            for (let i = 0; i < 12; i++) {
              if (months[i].split("|").indexOf(res[positions[2]].toLowerCase()) != -1) {
                let guess = {};
                guess.year = now.getFullYear();
                guess.month = i + 1;
                guess.day = res[positions[1]];
                guess.start = res.index;
                guess.end = res.index + res[0].length - 1;
                guess.str = res[0];
                guess.endtime = true;
                
                if (this.isPastDate(guess, now))
                  guess.year++;
                this.collected.push(guess);
                break;
              }
            }
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "until.month.date", ["(\\d{1,2})", "(\\d{1,2})"]);
    for (var alt in alts) {
      let re = new RegExp(alts[alt].pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[1] = parseInt(res[1], 10);
          res[2] = parseInt(res[2], 10);
          
          if (this.isValidMonth(res[2]) && this.isValidDay(res[1])) {
            let guess = {};
            guess.year = now.getFullYear();
            guess.month = res[2];
            guess.day = res[1];
            guess.start = res.index;
            guess.end = res.index + res[0].length - 1;
            guess.str = res[0];
            guess.endtime = true;
            
            if (this.isPastDate(guess, now)) {
              // find next such date
              let item = new Date(now.getTime());
              while (true) {
                item.setDate(item.getDate() + 1);
                if (item.getMonth() == res[2] - 1  &&
                  item.getDate() == res[1]) {
                    guess.year = item.getFullYear();
                    break;
                  }
              }
            }
            this.collected.push(guess);
          }
        }
      }
    }
    
    // date with year
    alts = this.getRepAlternatives(this.bundle, "day.numericmonth.year",
                              ["(\\d{1,2})", "(\\d{1,2})", "(\\d{2,4})" ]);
    for (var alt in alts) {
      let pattern = alts[alt].pattern;
      let positions = alts[alt].positions;

      let re = new RegExp(pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[positions[1]] = parseInt(res[positions[1]], 10);
          res[positions[2]] = parseInt(res[positions[2]], 10);
          if (res[positions[3]].length == 2)
            res[positions[3]] = "20" + res[positions[3]];
          res[positions[3]] = parseInt(res[positions[3]], 10);
          if (this.isValidDay(res[positions[1]]) && 
            this.isValidMonth(res[positions[2]]) && 
            this.isValidYear(res[positions[3]])) {
            
            let guess = {};
            guess.year = res[positions[3]];
            guess.month = res[positions[2]];
            guess.day = res[positions[1]];
            guess.start = res.index;
            guess.end = res.index + res[0].length - 1;
            guess.str = res[0];
            
            if (this.isPastDate(guess, now))
              guess.use = false;

            this.collected.push(guess);
          }
        }
      }
    }
    
    alts = this.getRepAlternatives(this.bundle, "due.day.numericmonth.year",
                              ["(\\d{1,2})", "(\\d{1,2})", "(\\d{2,4})" ]);
    for (var alt in alts) {
      let pattern = alts[alt].pattern;
      let positions = alts[alt].positions;

      let re = new RegExp(pattern, "ig");
      while ((res = re.exec(email)) != null) {
        if (res) {
          res[positions[1]] = parseInt(res[positions[1]], 10);
          res[positions[2]] = parseInt(res[positions[2]], 10);
          if (res[positions[3]].length == 2)
            res[positions[3]] = "20" + res[positions[3]];
          res[positions[3]] = parseInt(res[positions[3]], 10);
          if (this.isValidDay(res[positions[1]]) && 
            this.isValidMonth(res[positions[2]]) && 
            this.isValidYear(res[positions[3]])) {
            
            let guess = {};
            guess.year = res[positions[3]];
            guess.month = res[positions[2]];
            guess.day = res[positions[1]];
            guess.start = res.index;
            guess.end = res.index + res[0].length - 1;
            guess.str = res[0];
            guess.endtime = true;
            
            if (!this.isPastDate(guess, now))
              this.collected.push(guess);
          }
        }
      }
    }
    alts = this.getRepAlternatives(this.bundle, "day.monthname.year",
                              ["(\\d{1,2})", "(" + allMonths + ")", "(\\d{2,4})" ]);
    for (var alt in alts) {
      let pattern = alts[alt].pattern.replace(marker, "|", "g");
      let positions = alts[alt].positions;

      let re = new RegExp(pattern, "ig");
      
      while ((res = re.exec(email)) != null) {
        if (res && !this.restrictNumbers(res, email) && !this.restrictChars(res, email)) {
          res[positions[1]] = parseInt(res[positions[1]], 10);
          if (res[positions[3]].length == 2)
              res[positions[3]] = "20" + res[positions[3]];
          res[positions[3]] = parseInt(res[positions[3]], 10);
          if (this.isValidDay(res[positions[1]])) {
            for (let i = 0; i < 12; i++) {
              if (months[i].split("|").indexOf(res[positions[2]].toLowerCase()) != -1) {
                let guess = {};
                guess.year = res[positions[3]];
                guess.month = i + 1;
                guess.day = res[positions[1]];
                guess.start = res.index;
                guess.end = res.index + res[0].length - 1;
                guess.str = res[0];
                
                if (!this.isPastDate(guess, now))
                  this.collected.push(guess);
                break;
              }
            }
          }
        }
      }
    }
    
    this.markContained();
    this.collected = this.collected.sort(this.sort);
    return this.collected;
  },
  
  markContained: function markContained() {
    for (let first = 0; first < this.collected.length; first++) {
      for (let second = 0; second < this.collected.length; second++) {
        // included but not exactly the same
        if (first != second && 
            this.collected[first].start && this.collected[first].end &&
            this.collected[second].start && this.collected[second].end &&
            this.collected[second].start >= this.collected[first].start &&
            this.collected[second].end <= this.collected[first].end &&
           !(this.collected[second].start == this.collected[first].start &&
            this.collected[second].end == this.collected[first].end)) {
          
            this.collected[second].use = false;
        }
      }
    }
  },
  
  sort: function sort(one, two) {
    // sort the guess from email date as the last one
    if (one.start == undefined && two.start != undefined) {
      return 1;
    } else if (one.start != undefined && two.start == undefined) {
      return -1;
    } else if (one.start == undefined && two.start == undefined) {
      return 0;
      // sort dates before times
    } else if (one.year != undefined && two.year == undefined) {
      return -1;
    } else if (one.year == undefined && two.year != undefined) {
      return 1;
    } else if (one.year != undefined && two.year != undefined) {
      if (one.year < two.year) {
        return -1;
      } else if (one.year > two.year) {
        return 1;
      } else {
        if (one.month < two.month) {
          return -1;
        } else if (one.month > two.month) {
          return 1;
        } else {
          if (one.day < two.day) {
            return -1;
          } else if (one.day > two.day) {
            return 1;
          } else {
            return 0;
          }
        }
      }
    } else {
      if (one.hour < two.hour) {
        return -1;
      } else if (one.hour > two.hour) {
        return 1;
      } else {
        if (one.minute < two.minute) {
          return -1;
        } else if (one.minute > two.minute) {
          return 1;
        } else {
          return 0;
        }
      }
    }
  },
  
  guessStart: function guessStart(collected) {
    let startTimes = collected.filter(function(val) {
        return (val.endtime == false || val.endtime == undefined);});
    if (startTimes.length == 0)
      return {};
    else {
      /*for (val in startTimes) {
        if (startTimes[val].use != false) {
          dump("S: " + JSON.stringify(startTimes[val]) + "\n");
          this.aConsoleService.logStringMessage("S: " + JSON.stringify(startTimes[val]));
        }
      }*/
      
      var guess = {};
      let withDay = startTimes.filter(function(val) {
        return (val.day != undefined && val.use != false && val.start != undefined);});
      let withDayNA = withDay.filter(function(val) {
        return (val.ambiguous == undefined);});
      let withDayInit = startTimes.filter(function(val) {
        return (val.day != undefined && val.start == undefined);});
      let withMinute = startTimes.filter(function(val) {
        return (val.minute != undefined && val.use != false && val.start != undefined);});
      let withMinuteNA = withMinute.filter(function(val) {
        return (val.ambiguous == undefined);});
      let withMinuteInit = startTimes.filter(function(val) {
        return (val.minute != undefined && val.start == undefined);});
      
      // first use unambiguous guesses
      if (withDayNA.length != 0) {
        guess.year = withDayNA[0].year;
        guess.month = withDayNA[0].month;
        guess.day = withDayNA[0].day;
      // then also ambiguous ones
      } else if (withDay.length != 0) {
        guess.year = withDay[0].year;
        guess.month = withDay[0].month;
        guess.day = withDay[0].day;
      // and finally when nothing was found then use initial guess from send time
      } else {
        guess.year = withDayInit[0].year;
        guess.month = withDayInit[0].month;
        guess.day = withDayInit[0].day;
      }
      
      if (withMinuteNA.length != 0) {
        guess.hour = withMinuteNA[0].hour;
        guess.minute = withMinuteNA[0].minute;
      } else if (withMinute.length != 0) {
        guess.hour = withMinute[0].hour;
        guess.minute = withMinute[0].minute;
      }
      
      return guess;
    }
  },
  
  guessEnd: function guessEnd(collected, start, isTask) {
    let endTimes = collected.filter(function(val) {
        return (val.endtime == true);});
    if (endTimes.length == 0)
      return {};
    else {
      /*for (val in endTimes) {
         if (endTimes[val].use != false)
          dump("E: " + JSON.stringify(endTimes[val]) + "\n");
      }*/
      
      var guess = {};
      let withDay = endTimes.filter(function(val) {
        return (val.day != undefined && val.use != false);});
      let withDayNA = withDay.filter(function(val) {
        return (val.ambiguous == undefined);});
      let withMinute = endTimes.filter(function(val) {
        return (val.minute != undefined && val.use != false);});
      let withMinuteNA = withMinute.filter(function(val) {
        return (val.ambiguous == undefined);});
      
      let pos = isTask == true ? 0 : withDayNA.length - 1;
      if (withDayNA.length != 0) {
        guess.year = withDayNA[pos].year;
        guess.month = withDayNA[pos].month;
        guess.day = withDayNA[pos].day;
      } else if (withDay.length != 0) {
        pos = isTask == true ? 0 : withDay.length - 1;
        guess.year = withDay[pos].year;
        guess.month = withDay[pos].month;
        guess.day = withDay[pos].day;
      }
      
      if (withMinuteNA.length != 0) {
        pos = isTask == true ? 0 : withMinuteNA.length - 1;
        guess.hour = withMinuteNA[pos].hour;
        guess.minute = withMinuteNA[pos].minute;
        if (guess.day == undefined || guess.day == start.day) {
          if (withMinuteNA[pos].hour < start.hour ||
              (withMinuteNA[pos].hour == start.hour &&
              withMinuteNA[pos].minute < start.minute)
          ) {
            let nextDay = new Date(start.year, start.month - 1, start.day);
            nextDay.setTime(nextDay.getTime() + 60 * 60 * 24 * 1000);
            guess.year = nextDay.getFullYear();
            guess.month = nextDay.getMonth() + 1;
            guess.day = nextDay.getDate();
          }
        }
      } else if (withMinute.length != 0) {
        pos = isTask == true ? 0 : withMinute.length - 1;
        guess.hour = withMinute[pos].hour;
        guess.minute = withMinute[pos].minute;
        if (guess.day == undefined || guess.day == start.day) {
          if (withMinute[pos].hour < start.hour ||
              (withMinute[pos].hour == start.hour &&
              withMinute[pos].minute < start.minute)
          ) {
            let nextDay = new Date(start.year, start.month - 1, start.day);
            nextDay.setTime(nextDay.getTime() + 60 * 60 * 24 * 1000);
            guess.year = nextDay.getFullYear();
            guess.month = nextDay.getMonth() + 1;
            guess.day = nextDay.getDate();
          }
        }
      }
      
      if (guess.minute != undefined && guess.day == undefined) {
        guess.year = start.year;
        guess.month = start.month;
        guess.day = start.day;
      }
      
      return guess;
    }
  },

  getAlternatives: function getAlternatives(bundle, name) {
    let value;
    try {
      value = bundle.GetStringFromName(name);
      value = value.replace(" |", "|", "g").replace("| ", "|", "g");
      value = value.replace(/ +/g, "\\s*");
      let vals = value.split("|");
      vals.sort(function(one, two) {return two.length - one.length;});
      value = vals.join("|");
      return value.sanitize();
    } catch (ex) {
      this.aConsoleService.logStringMessage("Pattern not found: " + name);
      dump("Pattern not found: " + name + "\n");
      
      // fake a value to not error out
      return "abc %1$S def %2$S ghi %3$S";
    }
  },

  getRepAlternatives: function getRepAlternatives(bundle, name, replaceables) {
    let value;
    let alts = new Array();
    
    try {
      value = bundle.formatStringFromName(name, replaceables, replaceables.length);
      value = value.replace(" |", "|", "g").replace("| ", "|", "g");
      value = value.replace(/ +/g, "\\s*");
      value = value.sanitize();
      
      let patterns = value.split("|");
      let rawValues = this.getAlternatives(bundle, name).split("|");
      
      let i = 0;
      for (var pattern in patterns) {
        // XXX only add information when more than 1 replaceables, not needed otherwise
        let positions = this.getPositionsFor(rawValues[i]);
        alts[i] = {pattern: patterns[i], positions: positions};
        i++;
      }
    } catch (ex) {
      this.aConsoleService.logStringMessage("Pattern not found: " + name);
      dump("Pattern not found: " + name + "\n");
      
      // fake a value to not error out
      value = "abc def ghi";
    }
    
    return alts;
  },

  getPositionsFor: function getPositionsFor(s) {
    let positions = new Array();
    let re = /\%(\d)\$S/g;
    let match = true;
    let i = 0;
    while (true) {
      i++;
      match = re.exec(s);
      if (!match)
        break;
      positions[parseInt(match[1], 10)] = i;
    }
    
    return positions;
  },
  
  isValidYear: function isValidYear(year) {
    if (year >= 2000  && year <= 2050) return true;
    else return false;
  },
  
  isValidMonth: function isValidMonth(month) {
    if (month >= 1 && month <= 12) return true;
    else return false;
  },
  
  isValidDay: function isValidDay(day) {
    if (day >= 1 && day <= 31) return true;
    else return false;
  },
  
  isValidHour: function isValidHour(hour) {
    if (hour >= 0 && hour <= 23) return true;
    else return false;
  },
  
  isPastDate: function isPastDate(date, refDate) {
    // avoid changing original refDate
    let refDate = new Date(refDate.getTime());
    refDate.setHours(0);
    refDate.setMinutes(0);
    refDate.setSeconds(0);
    refDate.setMilliseconds(0);
    let jsDate;
    if (date.day != undefined)
      jsDate = new Date(date.year, date.month - 1, date.day);
    return jsDate < refDate;
  },
  
  isValidMinute: function isValidMinute(minute) {
    if (minute >= 0 && minute <= 59) return true;
    else return false;
  },
  
  normalizeHour: function normalizeHour(hour) {
    if (hour < this.dayStart && hour <= 11)
      return hour + 12;
    else
      return hour;
  },
  
  restrictNumbers: function restrictNumbers(res, email) {
    let pattern = email.substring(res.index, res.index + res[0].length);
    let before = email.charAt(res.index - 1);
    let after = email.charAt(res.index + res[0].length);
    let result = (/\d/.exec(before) && /\d/.exec(pattern.charAt(0))) ||
              (/\d/.exec(pattern.charAt(pattern.length - 1)) && /\d/.exec(after));
    return result != null;
  },
  
  restrictChars: function restrictChars(res, email) {
    let alphabet = this.getAlternatives(this.bundle, "alphabet");
    // for languages without regular alphabet ignore surrounding characters
    if (alphabet == "abc def ghi")
      return false;
    
    let pattern = email.substring(res.index, res.index + res[0].length);
    let before = email.charAt(res.index - 1);
    let after = email.charAt(res.index + res[0].length);
    
    let w = new RegExp("[" + alphabet + "]");
    let result = (w.exec(before) && w.exec(pattern.charAt(0))) ||
                 (w.exec(pattern.charAt(pattern.length - 1)) && w.exec(after));
    return result != null;
  }
}

// XXX should replace all special characters for regexp not just .
String.prototype.sanitize = function() {
  let res = this.replace(/([^\\])([\.])/g, "$1\\$2");
  return res;
}

String.prototype.unescape = function() {
  let res = this.replace(/\\([\.])/g, "$1");
  return res;
}
