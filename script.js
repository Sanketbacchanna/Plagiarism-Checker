document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const $ = (id) => document.getElementById(id);

    const fileUpload = $('fileUpload');
    const folderUpload = $('folderUpload');
    const referenceUpload = $('referenceUpload');
    const projectCodeInput = $('projectCode');
    const analysisMode = $('analysisMode');
    const langSelect = $('langSelect');
    const analyzeBtn = $('analyzeBtn');
    const resultsPanel = $('resultsPanel');
    const scannerPanel = $('scannerPanel');
    const historyPanel = $('historyPanel');
    const settingsPanel = $('settingsPanel');
    const referenceSection = $('referenceSection');
    const referenceList = $('referenceList');
    const matchesPanel = $('matchesPanel');
    const matchesList = $('matchesList');
    const noCorpusNotice = $('noCorpusNotice');

    const state = {
        references: [],
        lastReport: null,
        lastMode: 'plagiarism'
    };

    const SUPPORTED_TEXT = new Set([
        'txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
        'html', 'css', 'json', 'sql', 'xml', 'yaml', 'yml'
    ]);

    const IGNORE_PATHS = ['/node_modules/', '/.git/', '/.idea/', '/.vscode/', '/dist/', '/build/'];
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    // -----------------------------
    // Settings
    // -----------------------------
    function getSettings() {
        try {
            return {
                strict: false,
                ignoreShort: true,
                autoLang: true,
                ...JSON.parse(localStorage.getItem('codeGuardSettings') || '{}')
            };
        } catch {
            return { strict: false, ignoreShort: true, autoLang: true };
        }
    }

    function loadSettings() {
        const settings = getSettings();
        $('settingStrict').checked = !!settings.strict;
        $('settingIgnoreShort').checked = settings.ignoreShort !== false;
        $('settingAutoLang').checked = settings.autoLang !== false;
    }

    $('saveSettingsBtn')?.addEventListener('click', () => {
        localStorage.setItem('codeGuardSettings', JSON.stringify({
            strict: $('settingStrict').checked,
            ignoreShort: $('settingIgnoreShort').checked,
            autoLang: $('settingAutoLang').checked
        }));
        const button = $('saveSettingsBtn');
        const old = button.textContent;
        button.textContent = 'Saved!';
        setTimeout(() => button.textContent = old, 1200);
    });

    // -----------------------------
    // File extraction
    // -----------------------------
    function extensionOf(name) {
        const clean = name.split('?')[0].toLowerCase();
        return clean.includes('.') ? clean.split('.').pop() : '';
    }

    function shouldIgnore(file) {
        const path = file.webkitRelativePath || file.name;
        return IGNORE_PATHS.some(part => path.includes(part));
    }

    async function extractPdfText(file) {
        if (!window.pdfjsLib) throw new Error('PDF.js failed to load. Check your internet connection.');
        const buffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
        const pages = [];
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const content = await page.getTextContent();
            const text = content.items.map(item => item.str || '').join(' ');
            pages.push(`\n[Page ${pageNo}]\n${text}`);
        }
        return pages.join('\n').trim();
    }

    async function extractDocxText(file) {
        if (!window.mammoth) throw new Error('Mammoth.js failed to load. Check your internet connection.');
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        return (result.value || '').trim();
    }

    async function extractTextFromFile(file) {
        if (file.size > MAX_FILE_SIZE) {
            throw new Error(`File is larger than ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
        }

        const ext = extensionOf(file.name);
        if (ext === 'docx') return extractDocxText(file);
        if (ext === 'pdf') return extractPdfText(file);
        if (SUPPORTED_TEXT.has(ext)) return file.text();

        throw new Error(`Unsupported file type: .${ext || 'unknown'}`);
    }

    async function addFilesToTextarea(files) {
        const validFiles = Array.from(files).filter(file => !shouldIgnore(file));
        if (!validFiles.length) return;

        const chunks = [];
        const errors = [];

        for (const file of validFiles) {
            try {
                const text = await extractTextFromFile(file);
                if (!text.trim()) continue;
                const name = file.webkitRelativePath || file.name;
                chunks.push(validFiles.length > 1 || file.webkitRelativePath
                    ? `\n===== FILE: ${name} =====\n${text}`
                    : text);
            } catch (error) {
                console.error(error);
                errors.push(`${file.name}: ${error.message}`);
            }
        }

        if (chunks.length) {
            projectCodeInput.value = chunks.join('\n\n').trim();
        }

        if (errors.length) {
            alert(`Some files could not be read:\n\n${errors.slice(0, 8).join('\n')}`);
        }
    }

    async function addReferenceFiles(files) {
        const validFiles = Array.from(files).filter(file => !shouldIgnore(file));
        const errors = [];

        for (const file of validFiles) {
            try {
                const text = await extractTextFromFile(file);
                if (!text.trim()) continue;
                state.references.push({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    name: file.webkitRelativePath || file.name,
                    text
                });
            } catch (error) {
                console.error(error);
                errors.push(`${file.name}: ${error.message}`);
            }
        }

        renderReferences();
        if (errors.length) alert(`Some reference files could not be read:\n\n${errors.slice(0, 8).join('\n')}`);
    }

    fileUpload?.addEventListener('change', async (event) => {
        await addFilesToTextarea(event.target.files);
        event.target.value = '';
    });

    folderUpload?.addEventListener('change', async (event) => {
        await addFilesToTextarea(event.target.files);
        event.target.value = '';
    });

    referenceUpload?.addEventListener('change', async (event) => {
        await addReferenceFiles(event.target.files);
        event.target.value = '';
    });

    // -----------------------------
    // References UI
    // -----------------------------
    function renderReferences() {
        if (!state.references.length) {
            referenceList.innerHTML = '<div class="empty-reference">No reference documents added yet.</div>';
            return;
        }

        referenceList.innerHTML = state.references.map((ref, index) => `
            <div class="reference-item">
                <div>
                    <strong>${escapeHtml(ref.name)}</strong>
                    <span>${formatNumber(countWords(ref.text))} words</span>
                </div>
                <button class="remove-reference" data-index="${index}" title="Remove">Remove</button>
            </div>
        `).join('');

        referenceList.querySelectorAll('.remove-reference').forEach(button => {
            button.addEventListener('click', () => {
                state.references.splice(Number(button.dataset.index), 1);
                renderReferences();
            });
        });
    }

    // -----------------------------
    // Text normalization + similarity
    // -----------------------------
    function normalizeText(text) {
        return text
            .normalize('NFKC')
            .toLowerCase()
            .replace(/\u00ad/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenize(text) {
        const settings = getSettings();
        const words = normalizeText(text).split(' ').filter(Boolean);
        return settings.ignoreShort ? words.filter(w => w.length >= 4) : words;
    }

    function countWords(text) {
        return normalizeText(text).split(' ').filter(Boolean).length;
    }

    function createNgrams(words, size) {
        const grams = [];
        if (words.length < size) return grams;
        for (let i = 0; i <= words.length - size; i++) {
            grams.push(words.slice(i, i + size).join(' '));
        }
        return grams;
    }

    function countOccurrences(haystack, needle) {
        let count = 0;
        let start = 0;
        while (true) {
            const index = haystack.indexOf(needle, start);
            if (index === -1) break;
            count++;
            start = index + needle.length;
        }
        return count;
    }

    function compareAgainstReference(sourceText, referenceText, sourceName) {
        const sourceWords = tokenize(sourceText);
        const referenceWords = tokenize(referenceText);
        if (!sourceWords.length || !referenceWords.length) {
            return { score: 0, matchedWords: 0, matchedPhrases: 0, phrases: [] };
        }

        const settings = getSettings();
        const n = settings.strict ? 8 : 6;
        const sourceGrams = createNgrams(sourceWords, n);
        const referenceSet = new Set(createNgrams(referenceWords, n));
        const matchingGrams = sourceGrams.filter(g => referenceSet.has(g));

        // A phrase contains n words. Convert matched n-grams into an estimated
        // word coverage without double-counting overlapping phrases.
        const covered = new Set();
        const phrases = [];
        const sourceString = sourceWords.join(' ');
        const refString = referenceWords.join(' ');

        for (const gram of matchingGrams) {
            const occurrence = countOccurrences(sourceString, gram);
            if (occurrence > 0 && !phrases.includes(gram)) {
                phrases.push(gram);
            }
        }

        // Mark word positions for each matching n-gram.
        for (let i = 0; i <= sourceWords.length - n; i++) {
            const gram = sourceWords.slice(i, i + n).join(' ');
            if (referenceSet.has(gram)) {
                for (let j = i; j < i + n; j++) covered.add(j);
            }
        }

        const matchedWords = covered.size;
        const score = sourceWords.length
            ? Math.min(100, Math.round((matchedWords / sourceWords.length) * 100))
            : 0;

        // Only show up to 8 example phrases in the UI.
        const examples = phrases.slice(0, 8).map(phrase => ({
            phrase,
            source: sourceName,
            referenceOccurrences: countOccurrences(refString, phrase)
        }));

        return {
            score,
            matchedWords,
            matchedPhrases: matchingGrams.length,
            phrases: examples
        };
    }

    function runPlagiarismAnalysis(text) {
        if (!state.references.length) {
            return {
                hasCorpus: false,
                score: 0,
                matchedWords: 0,
                matchedPhrases: 0,
                sources: [],
                words: countWords(text),
                lines: text.split(/\r?\n/).filter(x => x.trim()).length
            };
        }

        const sourceResults = state.references.map(ref => {
            const result = compareAgainstReference(text, ref.text, ref.name);
            return { ...result, name: ref.name };
        }).filter(result => result.matchedWords > 0);

        sourceResults.sort((a, b) => b.score - a.score);

        const uniqueMatchedWords = new Set();
        const sourceWords = tokenize(text);
        const settings = getSettings();
        const n = settings.strict ? 8 : 6;

        // Build a union of matching positions across all references so the final
        // score doesn't exceed 100% just because several references contain the same text.
        const matchedPositions = new Set();
        for (const ref of state.references) {
            const refSet = new Set(createNgrams(tokenize(ref.text), n));
            for (let i = 0; i <= sourceWords.length - n; i++) {
                const gram = sourceWords.slice(i, i + n).join(' ');
                if (refSet.has(gram)) {
                    for (let j = i; j < i + n; j++) matchedPositions.add(j);
                }
            }
        }

        matchedPositions.forEach(pos => uniqueMatchedWords.add(pos));

        const score = sourceWords.length
            ? Math.min(100, Math.round((uniqueMatchedWords.size / sourceWords.length) * 100))
            : 0;

        const examples = [];
        const seenPhrases = new Set();
        sourceResults.forEach(result => {
            result.phrases.forEach(item => {
                if (!seenPhrases.has(item.phrase) && examples.length < 20) {
                    seenPhrases.add(item.phrase);
                    examples.push(item);
                }
            });
        });

        return {
            hasCorpus: true,
            score,
            matchedWords: uniqueMatchedWords.size,
            matchedPhrases: sourceResults.reduce((sum, r) => sum + r.matchedPhrases, 0),
            sources: sourceResults.slice(0, 10),
            phrases: examples,
            words: sourceWords.length,
            lines: text.split(/\r?\n/).filter(x => x.trim()).length
        };
    }

    // -----------------------------
    // Code heuristic (clearly labelled as heuristic)
    // -----------------------------
    function detectLanguage(text) {
        const selected = langSelect?.value || 'auto';
        if (selected !== 'auto') return selected;
        if (/\b(def|import|from)\b|print\(/.test(text)) return 'python';
        if (/\b(const|let|var|function)\b|=>|console\.log/.test(text)) return 'javascript';
        if (/\b(public|private|class|static|void|System\.out)\b/.test(text)) return 'java';
        if (/#include\s*<|std::|cout\s*<</.test(text)) return 'cpp';
        return 'unknown';
    }

    function runCodeAnalysis(code) {
        const lines = code.split(/\r?\n/);
        const nonEmpty = lines.filter(line => line.trim());
        const comments = nonEmpty.filter(line => /^\s*(\/\/|#|<!--|\/\*)/.test(line)).length;
        const keywords = /\b(if|else|for|while|switch|case|catch|try|&&|\|\||=>)\b/g;
        const complexity = (code.match(keywords) || []).length;
        const generic = (code.match(/\b(calculate|compute|result|temp|helper|foo|bar|data|item|index|value)\b/gi) || []).length;
        const wordCount = countWords(code);
        const commentDensity = nonEmpty.length ? Math.round((comments / nonEmpty.length) * 100) : 0;
        const predictability = nonEmpty.length ? Math.min(99, Math.round(30 + (generic / nonEmpty.length) * 100 + commentDensity)) : 0;

        let score = 15;
        if (generic / Math.max(1, nonEmpty.length) > 0.05) score += 20;
        if (generic / Math.max(1, nonEmpty.length) > 0.10) score += 15;
        if (complexity / Math.max(1, nonEmpty.length) < 0.05 && nonEmpty.length > 20) score += 15;
        if (commentDensity > 30) score += 10;
        if (getSettings().strict) score += 10;
        score = Math.max(0, Math.min(99, score));

        return {
            score,
            patterns: generic,
            predictability,
            complexity,
            commentDensity,
            lines: nonEmpty.length,
            words: wordCount,
            language: detectLanguage(code)
        };
    }

    // -----------------------------
    // UI
    // -----------------------------
    function setMode(mode) {
        state.lastMode = mode;
        const codeMode = mode === 'code';
        referenceSection.classList.toggle('hidden', codeMode);
        document.querySelectorAll('.code-only-control').forEach(el => el.classList.toggle('hidden-control', !codeMode));
        $('primaryBadge').textContent = codeMode ? 'Project Source Code' : 'Document to Check';
        $('modeHelp').textContent = codeMode
            ? 'This mode is a heuristic source-code analysis. It is not proof of AI authorship.'
            : 'Upload the document you want to check and one or more reference documents. The similarity percentage is calculated only against the supplied reference corpus.';
        projectCodeInput.placeholder = codeMode
            ? 'Paste source code or upload files/folders to analyze...'
            : 'Upload a DOCX/PDF/TXT document or paste text here...';
        analyzeBtn.querySelector('.btn-text').textContent = codeMode ? 'Analyze Code' : 'Check Plagiarism';
        hideResults();
    }

    analysisMode?.addEventListener('change', () => setMode(analysisMode.value));

    function hideResults() {
        resultsPanel.classList.add('hidden');
        resultsPanel.classList.remove('visible');
    }

    function showResults() {
        resultsPanel.classList.remove('hidden');
        resultsPanel.classList.add('visible');
    }

    function animateScore(score, color) {
        const progressCircle = $('progressCircle');
        const scoreElement = $('similarityScore');
        let current = 0;
        const step = Math.max(1, score / 50);
        const timer = setInterval(() => {
            current += step;
            if (current >= score) {
                current = score;
                clearInterval(timer);
            }
            scoreElement.textContent = `${Math.round(current)}%`;
            progressCircle.style.background = `conic-gradient(${color} ${current * 3.6}deg, var(--bg-primary) 0deg)`;
        }, 20);
    }

    function scoreColor(score) {
        if (score >= 50) return 'var(--danger)';
        if (score >= 20) return 'var(--warning)';
        return 'var(--success)';
    }

    function renderPlagiarismResults(report) {
        $('resultsTitle').textContent = 'Plagiarism Analysis Results';
        $('scoreTitle').textContent = 'Similarity';
        $('metricOneLabel').textContent = 'Matching Words';
        $('metricTwoLabel').textContent = 'Reference Sources';
        $('metricThreeLabel').textContent = 'Matched Phrases';
        $('metricFourLabel').textContent = 'Words Analyzed';
        $('metricFiveLabel').textContent = 'Lines / Paragraphs';

        $('metricOneValue').textContent = formatNumber(report.matchedWords);
        $('metricTwoValue').textContent = report.sources?.length || state.references.length;
        $('metricThreeValue').textContent = formatNumber(report.matchedPhrases);
        $('metricFourValue').textContent = formatNumber(report.words);
        $('metricFiveValue').textContent = formatNumber(report.lines);

        noCorpusNotice.classList.toggle('hidden', report.hasCorpus);
        matchesPanel.classList.toggle('hidden', !report.hasCorpus || !report.sources.length);
        $('codeDetailsPanel').classList.add('hidden');

        if (!report.hasCorpus) {
            $('statusText').textContent = 'Reference corpus required';
            $('statusText').className = 'status-text warning';
            $('riskLabel').textContent = 'Cannot calculate external similarity';
            $('riskFill').style.width = '0%';
            $('riskFill').style.backgroundColor = 'var(--warning)';
            animateScore(0, 'var(--warning)');
            matchesList.innerHTML = '';
            return;
        }

        const color = scoreColor(report.score);
        const status = report.score >= 50 ? 'High textual similarity' : report.score >= 20 ? 'Some matching text found' : 'Low textual similarity';
        $('statusText').textContent = status;
        $('statusText').className = `status-text ${report.score >= 50 ? 'danger' : report.score >= 20 ? 'warning' : 'safe'}`;
        $('riskLabel').textContent = report.score >= 50 ? 'High Similarity' : report.score >= 20 ? 'Moderate Similarity' : 'Low Similarity';
        $('riskFill').style.width = `${report.score}%`;
        $('riskFill').style.backgroundColor = color;
        animateScore(report.score, color);

        matchesList.innerHTML = report.sources.map(source => `
            <div class="match-card">
                <div class="match-card-head">
                    <strong>${escapeHtml(source.name)}</strong>
                    <span class="match-score">${source.score}%</span>
                </div>
                <div class="match-meta">${formatNumber(source.matchedWords)} matched words · ${formatNumber(source.matchedPhrases)} matching n-grams</div>
            </div>
        `).join('');
        $('matchSummary').textContent = `${report.sources.length} source(s) with detected overlap`;
    }

    function renderCodeResults(report) {
        $('resultsTitle').textContent = 'Code Analysis Results';
        $('scoreTitle').textContent = 'Heuristic AI Probability';
        $('metricOneLabel').textContent = 'AI-like Patterns';
        $('metricTwoLabel').textContent = 'Detected Language';
        $('metricThreeLabel').textContent = 'Logical Complexity';
        $('metricFourLabel').textContent = 'Comment Density';
        $('metricFiveLabel').textContent = 'Lines Analyzed';
        $('metricOneValue').textContent = report.patterns;
        $('metricTwoValue').textContent = report.language;
        $('metricThreeValue').textContent = report.complexity;
        $('metricFourValue').textContent = `${report.commentDensity}%`;
        $('metricFiveValue').textContent = report.lines;
        noCorpusNotice.classList.add('hidden');
        matchesPanel.classList.add('hidden');

        const color = report.score >= 75 ? 'var(--danger)' : report.score >= 40 ? 'var(--warning)' : 'var(--success)';
        $('statusText').textContent = report.score >= 75 ? 'High heuristic AI signal' : report.score >= 40 ? 'Mixed heuristic signal' : 'Low heuristic signal';
        $('statusText').className = `status-text ${report.score >= 75 ? 'danger' : report.score >= 40 ? 'warning' : 'safe'}`;
        $('riskLabel').textContent = 'Heuristic score — not proof of authorship';
        $('riskFill').style.width = `${report.score}%`;
        $('riskFill').style.backgroundColor = color;
        animateScore(report.score, color);

        const list = $('codeDetailsList');
        list.innerHTML = [
            `Detected language: ${report.language}`,
            `Code predictability metric: ${report.predictability}%`,
            `AI-like keyword/pattern count: ${report.patterns}`,
            `Logical structure count: ${report.complexity}`,
            'This score is a local heuristic and should not be presented as definitive AI-authorship evidence.'
        ].map(text => `<li><span>${escapeHtml(text)}</span></li>`).join('');
        $('codeDetailsPanel').classList.remove('hidden');
    }

    analyzeBtn?.addEventListener('click', async () => {
        const text = projectCodeInput.value.trim();
        if (!text) {
            alert('Please paste text/code or upload a file first.');
            return;
        }

        analyzeBtn.disabled = true;
        analyzeBtn.style.opacity = '0.7';
        analyzeBtn.querySelector('.btn-text').textContent = 'Analyzing...';

        try {
            await new Promise(resolve => setTimeout(resolve, 250));
            let report;
            if (analysisMode.value === 'code') {
                report = runCodeAnalysis(text);
                renderCodeResults(report);
            } else {
                report = runPlagiarismAnalysis(text);
                renderPlagiarismResults(report);
            }

            state.lastReport = report;
            saveToHistory({
                mode: analysisMode.value,
                score: report.score,
                words: report.words || countWords(text),
                sources: report.sources?.length || 0,
                date: new Date().toLocaleString()
            });
            showResults();
        } catch (error) {
            console.error(error);
            alert(`Analysis failed: ${error.message}`);
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.style.opacity = '1';
            analyzeBtn.querySelector('.btn-text').textContent = analysisMode.value === 'code' ? 'Analyze Code' : 'Check Plagiarism';
        }
    });

    // -----------------------------
    // Reports
    // -----------------------------
    function buildReportHtml() {
        const report = state.lastReport;
        if (!report) return null;
        const mode = state.lastMode;
        const sourceName = `${mode === 'plagiarism' ? 'Plagiarism' : 'Code'} Analysis Report`;
        const scoreLabel = mode === 'plagiarism' ? 'Similarity' : 'Heuristic AI Probability';
        const rows = mode === 'plagiarism'
            ? `
                <tr><td>Similarity</td><td>${report.score}%</td></tr>
                <tr><td>Matching words</td><td>${formatNumber(report.matchedWords)}</td></tr>
                <tr><td>Reference sources</td><td>${report.sources?.length || 0}</td></tr>
                <tr><td>Matched phrases</td><td>${formatNumber(report.matchedPhrases)}</td></tr>
                <tr><td>Words analyzed</td><td>${formatNumber(report.words)}</td></tr>
              `
            : `
                <tr><td>Heuristic AI probability</td><td>${report.score}%</td></tr>
                <tr><td>Detected language</td><td>${escapeHtml(report.language)}</td></tr>
                <tr><td>AI-like patterns</td><td>${report.patterns}</td></tr>
                <tr><td>Logical complexity</td><td>${report.complexity}</td></tr>
                <tr><td>Comment density</td><td>${report.commentDensity}%</td></tr>
              `;
        const sources = (report.sources || []).map(s => `<li>${escapeHtml(s.name)} — ${s.score}%</li>`).join('');

        return `<!doctype html><html><head><meta charset="utf-8"><title>${sourceName}</title>
        <style>body{font-family:Arial,sans-serif;max-width:850px;margin:40px auto;color:#111;line-height:1.5}h1{margin-bottom:4px}small{color:#666}.score{font-size:42px;font-weight:700;margin:24px 0}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:10px;border:1px solid #ddd}td:first-child{font-weight:600}li{margin:8px 0}.note{padding:14px;background:#f3f4f6;border-left:4px solid #555}</style></head>
        <body><h1>${sourceName}</h1><small>Generated by CodeGuard · ${new Date().toLocaleString()}</small>
        <div class="score">${scoreLabel}: ${report.score}%</div><table>${rows}</table>
        ${sources ? `<h2>Matching Sources</h2><ul>${sources}</ul>` : ''}
        <div class="note">${mode === 'plagiarism'
                ? 'This report measures similarity only against the reference documents supplied to this application. It is not a guarantee of originality and does not search the public internet.'
                : 'This is a local heuristic code-analysis score. It is not definitive evidence that code was or was not generated by AI.'}</div>
        </body></html>`;
    }

    $('downloadReportBtn')?.addEventListener('click', () => {
        const html = buildReportHtml();
        if (!html) return alert('Run an analysis first.');
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `codeguard-report-${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(url);
    });

    $('printReportBtn')?.addEventListener('click', () => {
        const html = buildReportHtml();
        if (!html) return alert('Run an analysis first.');
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return alert('Please allow pop-ups to print the report.');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    });

    // -----------------------------
    // History
    // -----------------------------
    function saveToHistory(item) {
        let history = [];
        try { history = JSON.parse(localStorage.getItem('codeGuardHistory') || '[]'); } catch { }
        history.unshift({ id: Date.now(), ...item });
        localStorage.setItem('codeGuardHistory', JSON.stringify(history.slice(0, 50)));
    }

    function loadHistory() {
        const list = $('historyList');
        let history = [];
        try { history = JSON.parse(localStorage.getItem('codeGuardHistory') || '[]'); } catch { }
        if (!history.length) {
            list.innerHTML = '<div class="empty-history">No analysis history found.</div>';
            $('clearHistoryBtn').classList.add('hidden');
            return;
        }
        $('clearHistoryBtn').classList.remove('hidden');
        list.innerHTML = history.map(item => {
            const isPlag = item.mode === 'plagiarism';
            const color = item.score >= 50 ? 'danger' : item.score >= 20 ? 'warning' : 'safe';
            return `<div class="history-item"><div class="history-info"><h4>${isPlag ? 'Plagiarism Check' : 'Code Analysis'}</h4><div class="history-meta">${escapeHtml(item.date)} · ${formatNumber(item.words)} words · ${item.sources || 0} reference source(s)</div></div><div class="history-score"><span class="score-value ${color}">${item.score}%</span><span class="status-text ${color}">${isPlag ? 'Similarity' : 'Heuristic'}</span></div></div>`;
        }).join('');
    }

    $('clearHistoryBtn')?.addEventListener('click', () => {
        localStorage.removeItem('codeGuardHistory');
        loadHistory();
    });

    // -----------------------------
    // Navigation
    // -----------------------------
    function switchTab(tab) {
        $('navScanner').classList.remove('active');
        $('navHistory').classList.remove('active');
        $('navSettings').classList.remove('active');
        scannerPanel.style.display = 'none';
        historyPanel.classList.add('hidden');
        settingsPanel.classList.add('hidden');
        resultsPanel.classList.add('hidden');

        if (tab === 'scanner') {
            $('navScanner').classList.add('active');
            scannerPanel.style.display = 'flex';
            if (state.lastReport) resultsPanel.classList.remove('hidden');
        } else if (tab === 'history') {
            $('navHistory').classList.add('active');
            historyPanel.classList.remove('hidden');
            loadHistory();
        } else {
            $('navSettings').classList.add('active');
            settingsPanel.classList.remove('hidden');
            loadSettings();
        }
    }

    $('navScanner')?.addEventListener('click', e => { e.preventDefault(); switchTab('scanner'); });
    $('navHistory')?.addEventListener('click', e => { e.preventDefault(); switchTab('history'); });
    $('navSettings')?.addEventListener('click', e => { e.preventDefault(); switchTab('settings'); });

    // -----------------------------
    // Helpers
    // -----------------------------
    function formatNumber(value) {
        return Number(value || 0).toLocaleString();
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    loadSettings();
    setMode('plagiarism');
    renderReferences();
});
