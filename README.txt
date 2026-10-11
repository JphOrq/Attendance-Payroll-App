TIME-IN / TIME-OUT PAYROLL - GOOGLE SHEETS

FILES
- Code.gs: Google Apps Script server and Google Sheets storage.
- Index.html: responsive web app interface.

SETUP
1. Create a Google Sheet.
2. Open Extensions > Apps Script.
3. Replace Code.gs with the supplied Code.gs.
4. Add an HTML file named Index and paste Index.html into it.
5. Select setupSheets and Run. Approve permissions.
6. Deploy > New deployment > Web app.
7. Execute as: Me. Set access to the intended users only.
8. Deploy and open the web app URL.

CALCULATION
Hourly rate = daily salary / 8.
Earned pay = hourly rate * elapsed time from timestamped time-in to timestamped time-out.
No break time is deducted. Actual timestamp durations support overnight shifts.

NOTES
- Work date is the date chosen on the form. Time-in and time-out are stored as real timestamps.
- Daily salary is copied to each attendance record so changing an employee's current salary does not rewrite previous records.
- Earned pay is an estimate before overtime, holiday pay, taxes, or other statutory/company deductions.
- Restrict deployment and spreadsheet access to authorized personnel because this contains employee payroll data.
- Set the Apps Script project time zone to your intended payroll time zone (for example, Asia/Manila) under Project Settings.
