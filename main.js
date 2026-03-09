const fs = require("fs");
function time12ToSeconds(time) {
    time = time.trim();
    let [t, period] = time.split(" ");
    let [h, m, s] = t.split(":").map(Number);

    if (period.toLowerCase() === "pm" && h !== 12) h += 12;
    if (period.toLowerCase() === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

function timeToSeconds(time) {
    let [h, m, s] = time.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function secondsToTime(sec) {
    let h = Math.floor(sec / 3600);
    let m = Math.floor((sec % 3600) / 60);
    let s = sec % 60;

    m = String(m).padStart(2, "0");
    s = String(s).padStart(2, "0");

    return `${h}:${m}:${s}`;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    function parseTime(t) {
        t = t.trim().toLowerCase();
        let [time, meridian] = t.split(" ");
        let [h, m, s] = time.split(":").map(Number);
        if (meridian === "pm" && h < 12) h += 12;
        if (meridian === "am" && h === 12) h = 0;
        return h * 3600 + m * 60 + s;
    }

    let startSeconds = parseTime(startTime);
    let endSeconds = parseTime(endTime);

    let durationSeconds = endSeconds - startSeconds;
    if (durationSeconds < 0) durationSeconds += 24 * 3600;

    let h = Math.floor(durationSeconds / 3600);
    let m = Math.floor((durationSeconds % 3600) / 60);
    let s = durationSeconds % 60;

    return `${h}:${m}:${s}`;
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    function parseTime24(t) {
        t = t.trim().toLowerCase();
        let [time, meridian] = t.split(" ");
        let [h, m, s] = time.split(":").map(Number);
        if (meridian === "pm" && h < 12) h += 12;
        if (meridian === "am" && h === 12) h = 0;
        return h * 3600 + m * 60 + s;
    }

    const DELIVERY_START = 8 * 3600; 
    const DELIVERY_END = 22 * 3600;  

    let startSec = parseTime24(startTime);
    let endSec = parseTime24(endTime);

    let idle = 0;

    if (startSec < DELIVERY_START) idle += Math.min(endSec, DELIVERY_START) - startSec;
    if (endSec > DELIVERY_END) idle += endSec - Math.max(startSec, DELIVERY_END);

    if (idle < 0) idle = 0;

    let h = Math.floor(idle / 3600);
    let m = Math.floor((idle % 3600) / 60);
    let s = idle % 60;

    return `${h}:${m}:${s}`;

}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shift = timeToSeconds(shiftDuration);
    let idle = timeToSeconds(idleTime);

    return secondsToTime(shift - idle);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    let active = timeToSeconds(activeTime);

    let eidStart = new Date("2025-04-10");
    let eidEnd = new Date("2025-04-30");
    let d = new Date(date);

    let quota;

    if (d >= eidStart && d <= eidEnd)
        quota = timeToSeconds("6:00:00");
    else
        quota = timeToSeconds("8:24:00");

    return active >= quota;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
     let data = fs.readFileSync(textFile, "utf8").trim();
    let rows = data ? data.split("\n") : [];

    for (let r of rows) {
        let cols = r.split(",");
        if (cols[0] === shiftObj.driverID && cols[2] === shiftObj.date)
            return {};
    }

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quotaMet = metQuota(shiftObj.date, activeTime);

    let newRecord = [
        shiftObj.driverID,
        shiftObj.driverName,
        shiftObj.date,
        shiftObj.startTime,
        shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        quotaMet,
        false
    ];

    let insertIndex = rows.length;

    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].split(",")[0] === shiftObj.driverID) {
            insertIndex = i + 1;
            break;
        }
    }

    rows.splice(insertIndex, 0, newRecord.join(","));

    fs.writeFileSync(textFile, rows.join("\n"));

    return {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    
    let rows = fs.readFileSync(textFile, "utf8").trim().split("\n");

    for (let i = 0; i < rows.length; i++) {
        let cols = rows[i].split(",");
        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = newValue;
            rows[i] = cols.join(",");
        }
    }

    fs.writeFileSync(textFile, rows.join("\n"));
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let data = fs.readFileSync(textFile, "utf-8").trim().split("\n");
    driverID = driverID.trim();
    month = month.replace(/^0/, ""); 

    let found = false;
    let count = 0;

    for (let line of data) {
        let [id,, date,, , , , , , hasBonus] = line.split(",").map(x => x.trim());
        if (id === driverID) {
            found = true;
            let lineMonth = String(Number(date.split("-")[1])); 
            if (lineMonth === month && hasBonus.toLowerCase() === "true") count++;
        }
    }

    return found ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let rows = fs.readFileSync(textFile, "utf8").trim().split("\n");

    let total = 0;

    for (let r of rows) {

        let cols = r.split(",");

        if (cols[0] === driverID) {

            let m = parseInt(cols[2].split("-")[1]);

            if (m === month)
                total += timeToSeconds(cols[7]);
        }
    }

    return secondsToTime(total);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    let rates = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let dayOff;

    for (let r of rates) {
        let c = r.split(",");
        if (c[0] === driverID) {
            dayOff = c[1];
            break;
        }
    }

    let rows = fs.readFileSync(textFile, "utf8").trim().split("\n");

    let total = 0;

    for (let r of rows) {

        let cols = r.split(",");

        if (cols[0] !== driverID) continue;

        let date = new Date(cols[2]);
        let m = date.getMonth() + 1;

        if (m !== month) continue;

        let weekday = date.toLocaleString("en-US", { weekday: "long" });

        if (weekday === dayOff) continue;

        let quota;

        if (date >= new Date("2025-04-10") && date <= new Date("2025-04-30"))
            quota = timeToSeconds("6:00:00");
        else
            quota = timeToSeconds("8:24:00");

        total += quota;
    }

    total -= bonusCount * 7200;

    if (total < 0) total = 0;

    return secondsToTime(total);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    let rows = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let basePay, tier;

    for (let r of rows) {
        let c = r.split(",");
        if (c[0] === driverID) {
            basePay = parseInt(c[2]);
            tier = parseInt(c[3]);
            break;
        }
    }

    let allowances = {1:50,2:20,3:10,4:3};

    let actual = timeToSeconds(actualHours);
    let required = timeToSeconds(requiredHours);

    if (actual >= required) return basePay;

    let missing = required - actual;

    let missingHours = Math.floor(missing / 3600);

    missingHours -= allowances[tier];

    if (missingHours < 0) missingHours = 0;

    let deductionRate = Math.floor(basePay / 185);

    let deduction = missingHours * deductionRate;

    return basePay - deduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
