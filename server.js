// ===============================
//  Feedback Admin Backend (with Semester + Academic Year)
// ===============================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const pool = require("./db");
const path = require("path");
const PDFDocument = require("pdfkit");
const moment = require("moment");
const fs = require("fs");

const app = express();
const router = express.Router();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// ✅ Add Multiple Feedback Allocations
// ===============================
app.post("/admin/add-multiple-feedback-allocations", (req, res) => {
  const { branch, year, course, section, semester, academic_year, subjects } = req.body;

  if (
    !branch ||
    !year ||
    !course ||
    !section ||
    !semester ||
    !academic_year ||
    !Array.isArray(subjects) ||
    subjects.length === 0
  ) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  const values = subjects.map((s) => [
    branch,
    year,
    course,
    section,
    semester,
    academic_year,
    s.subcode,
    s.subname,
    s.faculty_name,
  ]);

  const sql = `
    INSERT INTO feedback_subject_allocation 
    (branch, year, course, section, semester, academic_year, subcode, subname, faculty_name)
    VALUES ?
  `;

  pool.query(sql, [values], (err, result) => {
    if (err) {
      console.error("❌ Database Insert Error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error while adding allocations." });
    }
    res.json({ success: true, message: "✅ Feedback allocations added successfully!" });
  });
});

// ===============================
// ✅ Fetch All Allocations
// ===============================
app.get("/admin/view-feedback-allocations", (req, res) => {
  const sql = "SELECT * FROM feedback_subject_allocation ORDER BY id DESC";
  pool.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Fetch Error:", err);
      return res.status(500).json({ success: false, message: "Error fetching allocations" });
    }
    res.json(results);
  });
});

// ===============================
// ✅ Delete Allocation by ID
// ===============================
app.delete("/admin/delete-feedback-allocation/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM feedback_subject_allocation WHERE id = ?";
  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ Delete Error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error while deleting record" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    res.json({ success: true, message: "🗑️ Record deleted successfully" });
  });
});

// ===============================
// ✅ Update Allocation by ID
// ===============================
app.put("/admin/update-feedback-allocation/:id", (req, res) => {
  const { id } = req.params;
  const { branch, year, course, section, semester, academic_year, subcode, subname, faculty_name } =
    req.body;

  if (
    !branch ||
    !year ||
    !course ||
    !section ||
    !semester ||
    !academic_year ||
    !subcode ||
    !subname ||
    !faculty_name
  ) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  const sql = `
    UPDATE feedback_subject_allocation 
    SET branch=?, year=?, course=?, section=?, semester=?, academic_year=?, subcode=?, subname=?, faculty_name=?
    WHERE id=?
  `;

  pool.query(
    sql,
    [branch, year, course, section, semester, academic_year, subcode, subname, faculty_name, id],
    (err, result) => {
      if (err) {
        console.error("❌ Update Error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error while updating record" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Record not found" });
      }
      res.json({ success: true, message: "✅ Feedback allocation updated successfully" });
    }
  );
});

// ✅ Helper: Rating → Score
const ratingScore = (rating) => {
  switch (rating) {
    case "Excellent": return 4;
    case "Very Good": return 3;
    case "Good": return 2;
    case "Average": return 1;
    default: return 0;
  }
};

// ✅ Helper: % → Grade
const percentageToGrade = (p) => {
  if (p >= 90) return "EXCELLENT";
  if (p >= 80) return "VERY GOOD";
  if (p >= 70) return "GOOD";
  if (p >= 60) return "AVERAGE";
  if (p >= 50) return "NEEDS IMPROVEMENT";
  return "POOR";
};

// ===============================
// 📘 1️⃣ GET FILTER OPTIONS
// ===============================
app.get("/admin/get-feedback-options", (req, res) => {
  const queries = {
    courses: "SELECT DISTINCT course FROM feedback_responses WHERE course IS NOT NULL",
    branches: "SELECT DISTINCT branch FROM feedback_responses WHERE branch IS NOT NULL",
    years: "SELECT DISTINCT year FROM feedback_responses WHERE year IS NOT NULL ORDER BY year",
    semesters: "SELECT DISTINCT semester FROM feedback_responses WHERE semester IS NOT NULL ORDER BY semester",
    sections: "SELECT DISTINCT section FROM feedback_responses WHERE section IS NOT NULL ORDER BY section",
    academic_years: "SELECT DISTINCT academic_year FROM feedback_responses WHERE academic_year IS NOT NULL ORDER BY academic_year DESC"
  };

  let data = { courses: [], branches: [], years: [], semesters: [], sections: [], academic_years: [] };
  const keys = Object.keys(queries);
  let completed = 0;

  keys.forEach((key) => {
    pool.query(queries[key], (err, results) => {
      if (!err && results) data[key] = results.map(r => Object.values(r)[0]);
      completed++;
      if (completed === keys.length) res.json(data);
    });
  });
});


// --- PDF STYLING CONSTANTS ---
const COLOR_PRIMARY = "#1C4587"; // Deep Blue for headers/lines
const COLOR_ACCENT = "#0B5394"; // Medium Blue for titles
const COLOR_DETAIL_BG = "#EAF2FB"; // Light Blue/Gray background for course details
const COLOR_ROW_EVEN = "#F7F9FB"; // Very Light Gray for table rows
const COLOR_ROW_ODD = "#FFFFFF"; // White for table rows
const COLOR_TEXT = "#333333"; // Dark gray text

// Rating Colors
const RATING_COLORS = {
  "Excellent": "#198754", // Green
  "Very Good": "#0dcaf0", // Cyan/Light Blue
  "Good": "#ffc107", // Yellow/Orange
  "Average": "#dc3545", // Red
  "N/A": "#6c757d", // Gray
};

// ============================================
// 📘 OFFICIAL BRANCH-WISE FEEDBACK REPORT (Final Compact Layout v9 – Adjusted Row Heights)
// ============================================
app.get("/admin/download-feedback-branch-report", async (req, res) => {
  const { course, branch, year, semester, section } = req.query;

  if (!course || !branch || !year || !semester || !section) {
    return res.status(400).send("Missing required parameters");
  }

  try {
    const [rows] = await pool.promise().query(
      `SELECT faculty_name, subcode, subname, response
       FROM feedback_responses
       WHERE course = ? AND branch = ? AND year = ? AND semester = ? AND section = ?`,
      [course, branch, year, semester, section]
    );

    if (!rows.length) {
      return res.status(404).send("No feedback responses found for given criteria.");
    }

    // ---------------- Helper ----------------
    const avgToGrade = (avg) => {
      if (avg >= 3.5 && avg <= 4.0) return "Excellent";
      if (avg >= 2.5) return "Very Good";
      if (avg >= 1.5) return "Good";
      if (avg >= 1.0) return "Average";
      return "Needs Improvement";
    };

    // ---------------- Group Data ----------------
    const grouped = {};
    rows.forEach((r) => {
      const key = `${r.faculty_name}-${r.subcode}`;
      if (!grouped[key]) {
        grouped[key] = {
          faculty_name: r.faculty_name,
          subcode: r.subcode,
          subname: r.subname,
          counts: { Excellent: 0, "Very Good": 0, Good: 0, Average: 0 },
        };
      }
      if (grouped[key].counts.hasOwnProperty(r.response)) {
        grouped[key].counts[r.response]++;
      }
    });

    const reportData = Object.values(grouped).map((item) => {
      const c = item.counts;
      const total = c.Excellent + c["Very Good"] + c.Good + c.Average;
      const weighted =
        c.Excellent * 4 + c["Very Good"] * 3 + c.Good * 2 + c.Average * 1;
      const avg = total ? weighted / total : 0;
      return {
        ...item,
        avgScore: avg.toFixed(2),
        rating: avgToGrade(avg),
      };
    });

    // ---------------- PDF Setup ----------------
    const doc = new PDFDocument({ margin: 35, size: "A4" });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Feedback_Report_${branch}_${section}_${moment().format("YYYYMMDD")}.pdf"`
    );
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    const COLOR_PRIMARY = "#0b2e59";
    const COLOR_ACCENT = "#102c57";
    const COLOR_TEXT = "#222";
    const RATING_COLORS = {
      "Excellent": "#007b00",
      "Very Good": "#0563c1",
      "Good": "#cc8400",
      "Average": "#c1121f",
      "Needs Improvement": "#b02a37",
    };

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const borderMargin = 18;

    // ---------------- WATERMARK BACKGROUND ----------------
    const bgLogoPath = path.join(__dirname, "public", "college_logo.png");
    if (fs.existsSync(bgLogoPath)) {
      doc.save();
      doc.opacity(0.18);
      const imgWidth = 330;
      const imgHeight = 330;
      const centerX = (pageWidth - imgWidth) / 2;
      const centerY = (pageHeight - imgHeight) / 2;
      doc.image(bgLogoPath, centerX, centerY, { width: imgWidth, height: imgHeight });
      doc.restore();
      doc.opacity(1);
    }

    // ---------------- 4-SIDE BORDER ----------------
    doc
      .strokeColor(COLOR_PRIMARY)
      .lineWidth(1)
      .rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      .stroke();

    // ---------------- Header ----------------
    const logoPath = path.join(__dirname, "public", "college_logo.png");
    const logoWidth = 50;
    const logoY = 38;
    const textStartX = 110;
    const textWidth = pageWidth - textStartX - 50;

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, logoY, { width: logoWidth });
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(COLOR_PRIMARY)
      .text("SIR C.R. REDDY COLLEGE OF ENGINEERING", textStartX + 5, logoY + 4, {
        width: textWidth,
        align: "center",
      })
      .font("Helvetica")
      .fontSize(11)
      .fillColor(COLOR_TEXT)
      .text("(Autonomous)", textStartX, doc.y, { width: textWidth, align: "center" })
      .text("Approved by AICTE - New Delhi & Affiliated to JNTUK, Kakinada", textStartX, doc.y, {
        width: textWidth,
        align: "center",
      })
      .text("Accredited by NAAC with 'A' Grade | NBA Accredited", textStartX, doc.y, {
        width: textWidth,
        align: "center",
      })
      .text("Eluru, Andhra Pradesh - 534007", textStartX, doc.y, {
        width: textWidth,
        align: "center",
      });

    // Double Line Below Header
    let currentY = doc.y + 6;
    doc.strokeColor(COLOR_PRIMARY).lineWidth(1).moveTo(50, currentY).lineTo(545, currentY).stroke();
    doc.lineWidth(0.8).moveTo(50, currentY + 2.5).lineTo(545, currentY + 2.5).stroke();

    // ---------------- Report Title ----------------
    doc.moveDown(1.2);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(COLOR_ACCENT)
      .text("BRANCH-WISE CONSOLIDATED FEEDBACK REPORT", 0, doc.y, {
        align: "center",
      });

    // ---------------- Course Info Box ----------------
    doc.moveDown(0.8);
    currentY = doc.y;
    const boxHeight = 60;
    doc.roundedRect(50, currentY, 500, boxHeight, 6).strokeColor(COLOR_ACCENT).lineWidth(1).stroke();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_ACCENT);
    doc.text(`Course : ${course}`, 65, currentY + 10);
    doc.text(`Year : ${year}`, 320, currentY + 10);
    doc.text(`Branch : ${branch}`, 65, currentY + 27);
    doc.text(`Semester : ${semester}`, 320, currentY + 27);
    doc.text(`Section : ${section}`, 65, currentY + 44);
    currentY += boxHeight + 25;

    // ---------------- Transparent Table ----------------
    const headers = ["Faculty Name", "Sub Code", "Subject Name", "Avg", "Rating"];
    const colWidths = [150, 60, 150, 50, 70];
    const startX = 50;
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    // Increased row height (to make table bigger vertically)
    const rowHeight = 26;

    // Header Row
    doc.strokeColor("#000").lineWidth(0.7).rect(startX, currentY, totalWidth, rowHeight).stroke();
    doc.fillColor(COLOR_TEXT).font("Helvetica-Bold").fontSize(9);
    let xPos = startX;
    headers.forEach((header, i) => {
      doc.text(header, xPos, currentY + 7, { width: colWidths[i], align: "center" });
      xPos += colWidths[i];
    });
    currentY += rowHeight;

    doc.font("Helvetica").fontSize(9);
    reportData.forEach((item) => {
      // Rows (taller)
      doc.strokeColor("#000").rect(startX, currentY, totalWidth, rowHeight).stroke();

      let x = startX;
      doc.fillColor(COLOR_TEXT).text(item.faculty_name, x + 4, currentY + 8, {
        width: colWidths[0] - 5,
        align: "left",
      });
      x += colWidths[0];
      doc.text(item.subcode, x, currentY + 8, { width: colWidths[1], align: "center" });
      x += colWidths[1];
      doc.text(item.subname, x, currentY + 8, { width: colWidths[2], align: "center" });
      x += colWidths[2];
      doc.text(item.avgScore, x, currentY + 8, { width: colWidths[3], align: "center" });
      x += colWidths[3];
      const color = RATING_COLORS[item.rating] || COLOR_TEXT;
      doc.font("Helvetica-Bold").fillColor(color).text(item.rating, x, currentY + 8, {
        width: colWidths[4],
        align: "center",
      });
      doc.font("Helvetica").fillColor(COLOR_TEXT);

      currentY += rowHeight;
    });

    // ---------------- Rating Scale (Smaller) ----------------
    currentY += 28;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_ACCENT);
    doc.text("Rating Scale Interpretation:", 60, currentY);
    currentY += 10;

    const scaleCols = ["Rating", "Score Range"];
    const scaleColWidths = [160, 130];
    const scaleX = 60;
    const scaleRowHeight = 16; // smaller

    // Compact Header
    doc.strokeColor("#000").rect(scaleX, currentY, 290, scaleRowHeight).stroke();
    doc.fillColor(COLOR_TEXT).font("Helvetica-Bold").fontSize(8.8);
    let sx = scaleX;
    scaleCols.forEach((col, i) => {
      doc.text(col, sx, currentY + 3, { width: scaleColWidths[i], align: "center" });
      sx += scaleColWidths[i];
    });

    const scaleRows = [
      ["Excellent", "3.50 – 4.00"],
      ["Very Good", "2.50 – 3.49"],
      ["Good", "1.50 – 2.49"],
      ["Average", "1.00 – 1.49"],
      ["Needs Improvement", "< 1.00"],
    ];

    scaleRows.forEach((r) => {
      currentY += scaleRowHeight;
      doc.strokeColor("#000").rect(scaleX, currentY, 290, scaleRowHeight).stroke();
      let cx = scaleX;
      doc.fillColor(COLOR_TEXT).font("Helvetica").fontSize(8.8);
      r.forEach((txt, j) => {
        doc.text(txt, cx, currentY + 3, { width: scaleColWidths[j], align: "center" });
        cx += scaleColWidths[j];
      });
    });

    // ---------------- Signatures & Footer ----------------
    const signY = pageHeight - 130;

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLOR_TEXT)
      .text("Head of the Department", 60, signY, { align: "left" });

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLOR_TEXT)
      .text("Principal", 0, signY, { align: "right", width: pageWidth - 80 });

    const footerY = pageHeight - 50;
    const generatedText = `Generated on: ${moment().format("DD-MM-YYYY")}`;
    const devText = "Designed & Developed by DEPT OF CSE - Cyber Security(23-27)";

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("gray")
      .text(generatedText, 50, footerY - 10, { align: "left" });

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("gray")
      .text(devText, -50, footerY - 10, { align: "right" });

    doc.end();

  } catch (err) {
    console.error("❌ Branch Report Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ============================================
// 📘 Get Subject Names (Dynamic Based on Filters)
// ============================================
app.get("/admin/get-subject-names", async (req, res) => {
  const { course, branch, year, semester, section } = req.query;

  if (!course || !branch || !year || !semester || !section) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    const [rows] = await pool.promise().query(
      `SELECT DISTINCT subname 
       FROM feedback_responses
       WHERE course = ? AND branch = ? AND year = ? AND semester = ? AND section = ?
       AND subname IS NOT NULL AND subname != ''
       ORDER BY subname ASC`,
      [course, branch, year, semester, section]
    );

    const subjectNames = rows.map(r => r.subname);
    res.json(subjectNames);
  } catch (err) {
    console.error("Error fetching subject names:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ============================================
// 📘 OFFICIAL SUBJECT-WISE FEEDBACK REPORT
// (Professional layout + metadata order update)
// ============================================
app.get("/admin/download-feedback-subject-report", async (req, res) => {
  const { subname, course, branch, year, semester, section } = req.query;

  if (!subname || !course || !branch || !year || !semester || !section) {
    return res.status(400).send("Missing required parameters");
  }

  try {
    // 🔍 Get Faculty & Academic Year
    const [meta] = await pool.promise().query(
      `SELECT faculty_name, academic_year 
       FROM feedback_subject_allocation
       WHERE subname = ? AND course = ? AND branch = ? AND year = ? AND semester = ? AND section = ?
       LIMIT 1`,
      [subname, course, branch, year, semester, section]
    );

    const faculty_name = meta?.[0]?.faculty_name || "N/A";
    const academic_year = meta?.[0]?.academic_year || "N/A";
    const subjectName = subname || "N/A";

    // 🔍 Fetch responses
    const [rows] = await pool.promise().query(
      `SELECT reg_no, question_no, response
       FROM feedback_responses
       WHERE subname = ? AND course = ? AND branch = ? AND year = ? AND semester = ? AND section = ?
       ORDER BY question_no ASC`,
      [subname, course, branch, year, semester, section]
    );

    if (!rows.length) {
      return res.status(404).send("No feedback responses found for this subject.");
    }

    // ---------------- Total Students ----------------
    const uniqueStudents = new Set(rows.map(r => r.reg_no));
    const totalStudents = uniqueStudents.size;

    // ---------------- Questions ----------------
    const [questions] = await pool.promise().query(
      `SELECT question_number, question FROM questions ORDER BY question_number ASC`
    );
    const questionTextMap = {};
    questions.forEach(q => (questionTextMap[q.question_number] = q.question));

    // ---------------- Scoring ----------------
    const responseToScore = (r) => ({
      "Excellent": 4,
      "Very Good": 3,
      "Good": 2,
      "Average": 1,
      "Needs Improvement": 0
    }[r] ?? 0);

    const questionMap = {};
    rows.forEach(r => {
      if (!questionMap[r.question_no]) questionMap[r.question_no] = [];
      questionMap[r.question_no].push(responseToScore(r.response));
    });

    const questionData = Object.keys(questionMap).map(q => {
      const scores = questionMap[q];
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const percentage = ((avgScore / 4) * 100).toFixed(2);
      return {
        question_no: q,
        question_text: questionTextMap[q] || "N/A",
        avgScore: avgScore.toFixed(2),
        percentage,
      };
    });

    // ---------------- Overall Summary ----------------
    const overallAvg =
      questionData.reduce((sum, q) => sum + parseFloat(q.avgScore), 0) / questionData.length;
    const overallPercentage = ((overallAvg / 4) * 100).toFixed(2);
    const overallGrade =
      overallPercentage >= 90 ? "Excellent" :
      overallPercentage >= 80 ? "Very Good" :
      overallPercentage >= 70 ? "Good" :
      overallPercentage >= 60 ? "Average" : "Needs Improvement";

    // =====================================================
    // 📄 PDF GENERATION
    // =====================================================
    const doc = new PDFDocument({ margin: 35, size: "A4" });
    const filename = `Subject_Report_${subname.replace(/\s+/g, "_")}_${branch.replace(/\s+/g, "_")}_${year}_Year_${semester}_Sem_${section}_${moment().format("YYYYMMDD")}.pdf`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    const COLOR_PRIMARY = "#0b2e59";
    const COLOR_ACCENT = "#102c57";
    const COLOR_TEXT = "#000";
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // =====================================================
    // 🏛️ HEADER
    // =====================================================
    const headerLogo = path.join(__dirname, "public", "college_logo.png");
    if (fs.existsSync(headerLogo)) doc.image(headerLogo, 55, 40, { width: 50 });

    doc.font("Helvetica-Bold").fontSize(17).fillColor(COLOR_PRIMARY)
      .text("SIR C.R. REDDY COLLEGE OF ENGINEERING", 40, 40, { align: "center" });
    doc.font("Helvetica").fontSize(11).fillColor(COLOR_TEXT)
      .text("(Autonomous)", { align: "center" })
      .text("Approved by AICTE - New Delhi & Affiliated to JNTUK, Kakinada", { align: "center" })
      .text("Accredited by NAAC with 'A' Grade | NBA Accredited", { align: "center" })
      .text("Eluru, Andhra Pradesh - 534007", { align: "center" });

    let currentY = doc.y + 8;
    doc.strokeColor(COLOR_PRIMARY).lineWidth(1.2).moveTo(50, currentY).lineTo(545, currentY).stroke();
    doc.lineWidth(0.8).moveTo(50, currentY + 3).lineTo(545, currentY + 3).stroke();

    // =====================================================
    // 🌈 WATERMARK
    // =====================================================
    const bgLogo = path.join(__dirname, "public", "college_logo.png");
    if (fs.existsSync(bgLogo)) {
      doc.save();
      doc.opacity(0.18);
      const imgWidth = 320, imgHeight = 320;
      doc.image(bgLogo, (pageWidth - imgWidth) / 2, (pageHeight - imgHeight) / 2, { width: imgWidth });
      doc.restore();
      doc.opacity(1);
    }

    // =====================================================
    // 📏 BORDER
    // =====================================================
    const borderMargin = 18;
    doc.strokeColor(COLOR_PRIMARY).lineWidth(1)
      .rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      .stroke();

    // =====================================================
    // 📋 TITLE
    // =====================================================
    doc.moveDown(1.3);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOR_ACCENT)
      .text("SUBJECT-WISE CONSOLIDATED FEEDBACK REPORT", { align: "center" });

    // =====================================================
    // 🧾 INFO BOX (updated order)
    // =====================================================
    doc.moveDown(1);
    currentY = doc.y;
    const boxHeight = 95;
    doc.roundedRect(50, currentY, 500, boxHeight, 6)
      .strokeColor(COLOR_ACCENT).lineWidth(1).stroke();

    const leftX = 65, rightX = 320;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_ACCENT);
    doc.text(`Course : ${course}`, leftX, currentY + 12);
    doc.text(`Branch : ${branch}`, rightX, currentY + 12);
    doc.text(`Year : ${year}`, leftX, currentY + 29);
    doc.text(`Semester : ${semester} | Section : ${section}`, rightX, currentY + 29);
    doc.text(`Subject Name : ${subjectName}`, leftX, currentY + 46);
    doc.text(`Faculty Name : ${faculty_name}`, rightX, currentY + 46);
    doc.text(`Academic Year : ${academic_year}`, leftX, currentY + 63);

    currentY += boxHeight + 30;

    // =====================================================
    // 📊 TABLE
    // =====================================================
    const headers = ["Q.No", "Question", "Avg", "%"];
    const colWidths = [45, 290, 70, 75];
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const startX = 50, rowHeight = 22;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_PRIMARY);
    let xPos = startX;
    headers.forEach((header, i) => {
      doc.text(header, xPos, currentY + 6, { width: colWidths[i], align: "center" });
      xPos += colWidths[i];
    });
    doc.strokeColor("#999").rect(startX, currentY, totalWidth, rowHeight).stroke();
    currentY += rowHeight;

    doc.font("Helvetica").fontSize(9).fillColor(COLOR_TEXT);
    questionData.forEach(item => {
      let x = startX;
      const textHeight = doc.heightOfString(item.question_text, { width: colWidths[1] - 6 });
      const dynamicHeight = Math.max(rowHeight, textHeight + 8);
      doc.strokeColor("#ccc").rect(startX, currentY, totalWidth, dynamicHeight).stroke();

      doc.text(item.question_no, x, currentY + 6, { width: colWidths[0], align: "center" });
      x += colWidths[0];
      doc.text(item.question_text, x + 4, currentY + 5, { width: colWidths[1] - 6, align: "left" });
      x += colWidths[1];
      doc.text(item.avgScore, x, currentY + 6, { width: colWidths[2], align: "center" });
      x += colWidths[2];
      doc.text(`${item.percentage}%`, x, currentY + 6, { width: colWidths[3], align: "center" });

      currentY += dynamicHeight;
      if (currentY > pageHeight - 150) {
        doc.addPage();
        currentY = 50;
      }
    });

    // =====================================================
    // 📈 SUMMARY
    // =====================================================
    currentY += 25;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_ACCENT);
    doc.text(`Total Students Responded : ${totalStudents}`, 60, currentY);
    doc.text(`Overall Percentage : ${overallPercentage}%`, -60, currentY, { align: "right" });
    currentY += 16;
    doc.text(`Overall Grade : ${overallGrade}`, -60, currentY, { align: "right" });

    // =====================================================
    // ✍️ SIGNATURES
    // =====================================================
    const signY = pageHeight - 105;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_TEXT)
      .text("Head of the Department", 60, signY)
      .text("Principal", 0, signY, { align: "right", width: pageWidth - 80 });

    // =====================================================
    // 📅 FOOTER
    // =====================================================
    const footerY = pageHeight - 55;
    doc.font("Helvetica").fontSize(8).fillColor("gray")
      .text(`Generated on: ${moment().format("DD-MM-YYYY")}`, 50, footerY, { align: "left" });
    doc.font("Helvetica-Bold").fillColor("gray")
      .text("Designed & Developed by CSE - Cyber Security (23-27)", -50, footerY, { align: "right" });

    doc.end();
  } catch (err) {
    console.error("❌ Subject Report Error:", err);
    res.status(500).send("Internal Server Error");
  }
});



// ✅ Get all questions
app.get("/admin/questions", (req, res) => {
  const sql = "SELECT * FROM questions ORDER BY question_number ASC";
  pool.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Error fetching questions:", err);
      return res.status(500).json({ error: "Failed to fetch questions" });
    }
    res.json(results);
  });
});

// ✅ Add a new question
app.post("/admin/questions", (req, res) => {
  const { question } = req.body;
  pool.query("SELECT MAX(question_number) AS maxNum FROM questions", (err, rows) => {
    if (err) {
      console.error("❌ Error getting max question number:", err);
      return res.status(500).json({ error: "Failed to get question number" });
    }

    const nextNum = (rows[0].maxNum || 0) + 1;
    pool.query(
      "INSERT INTO questions (question_number, question) VALUES (?, ?)",
      [nextNum, question],
      (err2) => {
        if (err2) {
          console.error("❌ Error inserting question:", err2);
          return res.status(500).json({ error: "Failed to add question" });
        }
        res.json({ success: true, message: "Question added successfully" });
      }
    );
  });
});

// ✅ Update a question
app.put("/admin/questions/:id", (req, res) => {
  const { id } = req.params;
  const { question } = req.body;

  pool.query("UPDATE questions SET question = ? WHERE id = ?", [question, id], (err, result) => {
    if (err) {
      console.error("❌ Error updating question:", err);
      return res.status(500).json({ error: "Failed to update question" });
    }

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Question not found" });

    res.json({ success: true, message: "Question updated successfully" });
  });
});

// ✅ Delete a question
app.delete("/admin/questions/:id", (req, res) => {
  const { id } = req.params;

  pool.query("DELETE FROM questions WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("❌ Error deleting question:", err);
      return res.status(500).json({ error: "Failed to delete question" });
    }

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Question not found" });

    res.json({ success: true, message: "Question deleted successfully" });
  });
});


app.use("/", router);

// ===============================
// ✅ Serve Admin Panel
// ===============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "adminpanel.html"));
});

// ===============================
// ✅ Start Server
// ===============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
