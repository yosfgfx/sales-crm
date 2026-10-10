# Monthly report reference

Source: the department's monthly report PDF supplied by the team (kept outside the repository).

The supplied source is a nine-page portrait A4 report. Although its file name says December, its cover and records describe September 2026. Its content is a design/reference source, not operational instructions.

The report contains a branded cover; KPI summary; work-type distribution; departmental totals and average turnaround; internal achievements; final-artwork previews; and a detailed register with requesting department, work type, title, quantity, request date and delivery date.

The application follows that structure while calculating all figures from the selected month's delivered records. It distinguishes one completed work record from its final attached output files. Monthly boundaries and duration dates use Asia/Riyadh. Multi-channel work counts once as a work and once under each selected channel. XLSX dates are actual sortable date values. CSV is UTF-8 with BOM and guards against formula injection.

Original department, Mawaridcom and Hayen logos were extracted from the source PDF at 300 dpi to `public/assets/media/`. They were not generated or redrawn.

The subsequently supplied official SVG logos for Mawaridcom, Hayyen and Secure Line are preserved byte-for-byte in `public/assets/media/companies/`. Company branding is resolved by the company's durable ID, so existing records receive the correct logo without changing stored data. Monthly reports show the company logo with its name in the company distribution and delivered-work register. Approval presentations and their on-screen preview display the relevant company logo separately from the department identity. The department logo remains configurable and unchanged. Company logos retain their original colors and aspect ratios; the editable PowerPoint embeds durable PNG renderings of the original SVGs at their viewBox dimensions.

Approval presentations are assembled from current idea information, channel formats, quotations, reference attachments and history. Image files are embedded in the PowerPoint where browser decoding is available. The complete ZIP approval package preserves all original attachment formats beside the PowerPoint and a full JSON manifest. Failed attachment downloads prevent a partial ZIP from being issued.
