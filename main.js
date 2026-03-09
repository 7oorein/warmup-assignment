const fs = require("fs");

// ====================== Helpers ======================
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
    const pad = n => n.toString().padStart(2, "0");
    return `${h}:${pad(m)}:${pad(s)}`;
}

// ====================== 1. getShiftDuration ======================
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

    // Handle overnight shifts
    let durationSeconds = endSeconds - startSeconds;
    if (durationSeconds < 0) durationSeconds += 24 * 3600;

    return secondsToTime(durationSeconds);
}

// ====================== 2. getIdleTime ======================
function getIdleTime(startTime, endTime) {
    const DELIVERY_START = 8 * 3600; // 8 AM
    const DELIVERY_END = 22 * 3600;  // 10 PM

    let startSec = time12ToSeconds(startTime);
    let endSec = time12ToSeconds(endTime);

    // Handle overnight shifts
    if (endSec < startSec) endSec += 24 * 3600;

    let idle = 0;

    // Before 8 AM
    if (startSec < DELIVERY_START) {
        idle += Math.min(endSec, DELIVERY_START) - startSec;
    }

    // After 10 PM
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

    // Duplicate check
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

    // Insert after last record of same driver
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
    const data = fs.readFileSync(textFile, "utf-8").trim().split("\n");
    let count = 0;
    let found = false;
    month = month.toString().padStart(2, "0");

    for (let line of data) {
        let parts = line.split(",");
        let [id, , , , , , , , , hasBonus] = parts.map(s => s.trim());
        if (id === driverID) {
            found = true;
            let dateMonth = parts[2].split("-")[1].padStart(2, "0");
            if (dateMonth === month && hasBonus.toString().toLowerCase() === "true") {
                count++;
            }
        }
    }

    return found ? count : -1;
}

// ====================== 8. getTotalActiveHoursPerMonth ======================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let rows = fs.existsSync(textFile) ? fs.readFileSync(textFile, "utf8").trim().split("\n") : [];
    let total = 0;

    for (let r of rows) {
        let cols = r.split(",");
        if (cols[0] === driverID) {
            let m = parseInt(cols[2].split("-")[1]);
            if (m === month) total += timeToSeconds(cols[7]);
        }
    }

    return secondsToTime(total);
}

// ====================== 9. getRequiredHoursPerMonth ======================
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

    let rows = fs.existsSync(textFile) ? fs.readFileSync(textFile, "utf8").trim().split("\n") : [];
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

    total -= bonusCount * 7200; // 2 hours per bonus
    if (total < 0) total = 0;

    return secondsToTime(total);
}

// ====================== 10. getNetPay ======================
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
    let missingHours = Math.floor(missing / 3600) - allowances[tier];
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