const fs = require("fs");

// ====================== Helpers ======================
function time12ToSeconds(time) {
    time = time.trim();
    let [t, period] = time.split(" ");
    let [h, m, s] = t.split(":").map(Number);

    period = period.toLowerCase();

    if (period === "pm" && h !== 12) h += 12;
    if (period === "am" && h === 12) h = 0;

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

    const pad = n => n.toString().padStart(2, "0");
    return `${h}:${pad(m)}:${pad(s)}`;
}

// ====================== 1. getShiftDuration ======================
function getShiftDuration(startTime, endTime) {

    let startSeconds = time12ToSeconds(startTime);
    let endSeconds = time12ToSeconds(endTime);

    let duration = endSeconds - startSeconds;

    if (duration < 0) duration += 24 * 3600;

    return secondsToTime(duration);
}

// ====================== 2. getIdleTime ======================
function getIdleTime(startTime, endTime) {

    const DELIVERY_START = 8 * 3600;
    const DELIVERY_END = 22 * 3600;

    let startSec = time12ToSeconds(startTime);
    let endSec = time12ToSeconds(endTime);

    if (endSec < startSec) endSec += 24 * 3600;

    let idle = 0;

    if (startSec < DELIVERY_START) {
        idle += Math.min(endSec, DELIVERY_START) - startSec;
    }

    if (endSec > DELIVERY_END) {
        idle += endSec - Math.max(startSec, DELIVERY_END);
    }

    if (idle < 0) idle = 0;

    return secondsToTime(idle);
}

// ====================== 3. getActiveTime ======================
function getActiveTime(shiftDuration, idleTime) {

    let shift = timeToSeconds(shiftDuration);
    let idle = timeToSeconds(idleTime);

    return secondsToTime(shift - idle);
}

// ====================== 4. metQuota ======================
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

// ====================== 5. addShiftRecord ======================
function addShiftRecord(textFile, shiftObj) {

    let data = fs.existsSync(textFile) ? fs.readFileSync(textFile, "utf8").trim() : "";
    let rows = data ? data.split("\n") : [];

    for (let r of rows) {
        let cols = r.split(",");
        if (cols[0] === shiftObj.driverID && cols[2] === shiftObj.date) {
            return {};
        }
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

// ====================== 6. setBonus ======================
function setBonus(textFile, driverID, date, newValue) {

    if (!fs.existsSync(textFile)) return;

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

// ====================== 7. countBonusPerMonth ======================
function countBonusPerMonth(textFile, driverID, month) {

    if (!fs.existsSync(textFile)) return -1;

    let rows = fs.readFileSync(textFile, "utf8").trim().split("\n");

    month = month.toString().padStart(2, "0");

    let count = 0;
    let found = false;

    for (let r of rows) {

        let cols = r.split(",");

        if (cols[0] === driverID) {

            found = true;

            let fileMonth = cols[2].split("-")[1].padStart(2, "0");

            if (fileMonth === month && cols[9].trim().toLowerCase() === "true") {
                count++;
            }
        }
    }

    return found ? count : -1;
}

// ====================== 8. getTotalActiveHoursPerMonth ======================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {

    if (!fs.existsSync(textFile)) return "0:00:00";

    let rows = fs.readFileSync(textFile, "utf8").trim().split("\n");

    let total = 0;

    for (let r of rows) {

        let cols = r.split(",");

        if (cols[0] === driverID) {

            let m = parseInt(cols[2].split("-")[1]);

            if (m === month) {
                total += timeToSeconds(cols[7]);
            }
        }
    }

    return secondsToTime(total);
}

// ====================== 9. getRequiredHoursPerMonth ======================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {

    let rates = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let dayOff;

    for (let r of rates) {

        let cols = r.split(",");

        if (cols[0] === driverID) {
            dayOff = cols[1];
            break;
        }
    }

    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    let rows = fs.existsSync(textFile)
        ? fs.readFileSync(textFile,"utf8").trim().split("\n")
        : [];

    let total = 0;

    for (let r of rows) {

        let cols = r.split(",");

        if (cols[0] !== driverID) continue;

        let date = new Date(cols[2]);

        if (date.getMonth() + 1 !== month) continue;

        let weekday = days[date.getDay()];

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

// ====================== 10. getNetPay ======================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {

    let rows = fs.readFileSync(rateFile,"utf8").trim().split("\n");

    let basePay;
    let tier;

    for (let r of rows) {

        let cols = r.split(",");

        if (cols[0] === driverID) {

            basePay = parseInt(cols[2]);
            tier = parseInt(cols[3]);
            break;
        }
    }

    const allowances = {1:50,2:20,3:10,4:3};

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

// ====================== Export ======================
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