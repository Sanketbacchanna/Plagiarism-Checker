document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // =========================================================
    // ELEMENT HELPERS
    // =========================================================

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


    // =========================================================
    // APPLICATION STATE
    // =========================================================

    const state = {
        references: [],
        lastReport: null,
        lastMode: 'plagiarism',
        currentFile: null
    };


    // =========================================================
    // CONFIGURATION
    // =========================================================

    const ML_API_URL =
        'http://127.0.0.1:8000/api/check-plagiarism';

    const SUPPORTED_TEXT = new Set([
        'txt',
        'md',
        'js',
        'ts',
        'jsx',
        'tsx',
        'py',
        'java',
        'c',
        'cpp',
        'h',
        'hpp',
        'html',
        'css',
        'json',
        'sql',
        'xml',
        'yaml',
        'yml'
    ]);

    const IGNORE_PATHS = [
        '/node_modules/',
        '/.git/',
        '/.idea/',
        '/.vscode/',
        '/dist/',
        '/build/'
    ];

    const MAX_FILE_SIZE =
        10 * 1024 * 1024;


    // =========================================================
    // SETTINGS
    // =========================================================

    function getSettings() {

        try {

            return {
                strict: false,
                ignoreShort: true,
                autoLang: true,
                ...JSON.parse(
                    localStorage.getItem(
                        'codeGuardSettings'
                    ) || '{}'
                )
            };

        } catch {

            return {
                strict: false,
                ignoreShort: true,
                autoLang: true
            };
        }
    }


    function loadSettings() {

        const settings =
            getSettings();

        if ($('settingStrict')) {
            $('settingStrict').checked =
                !!settings.strict;
        }

        if ($('settingIgnoreShort')) {
            $('settingIgnoreShort').checked =
                settings.ignoreShort !== false;
        }

        if ($('settingAutoLang')) {
            $('settingAutoLang').checked =
                settings.autoLang !== false;
        }
    }


    $('saveSettingsBtn')?.addEventListener(
        'click',
        () => {

            localStorage.setItem(
                'codeGuardSettings',
                JSON.stringify({

                    strict:
                        $('settingStrict')?.checked || false,

                    ignoreShort:
                        $('settingIgnoreShort')?.checked !== false,

                    autoLang:
                        $('settingAutoLang')?.checked !== false
                })
            );


            const button =
                $('saveSettingsBtn');

            if (!button) return;


            const oldText =
                button.textContent;

            button.textContent =
                'Saved!';


            setTimeout(
                () => {
                    button.textContent =
                        oldText;
                },
                1200
            );
        }
    );


    // =========================================================
    // FILE HELPERS
    // =========================================================

    function extensionOf(name) {

        const clean =
            String(name || '')
                .split('?')[0]
                .toLowerCase();

        return clean.includes('.')
            ? clean.split('.').pop()
            : '';
    }


    function shouldIgnore(file) {

        const path =
            file.webkitRelativePath ||
            file.name ||
            '';

        return IGNORE_PATHS.some(
            part =>
                path.includes(part)
        );
    }


    // =========================================================
    // PDF EXTRACTION
    // =========================================================

    async function extractPdfText(file) {

        if (!window.pdfjsLib) {

            throw new Error(
                'PDF.js failed to load. Check your internet connection.'
            );
        }


        const buffer =
            await file.arrayBuffer();


        const pdf =
            await window.pdfjsLib
                .getDocument({
                    data: buffer
                })
                .promise;


        const pages = [];


        for (
            let pageNo = 1;
            pageNo <= pdf.numPages;
            pageNo++
        ) {

            const page =
                await pdf.getPage(
                    pageNo
                );


            const content =
                await page.getTextContent();


            const text =
                content.items
                    .map(
                        item =>
                            item.str || ''
                    )
                    .join(' ');


            pages.push(
                `\n[Page ${pageNo}]\n${text}`
            );
        }


        return pages
            .join('\n')
            .trim();
    }


    // =========================================================
    // DOCX EXTRACTION
    // =========================================================

    async function extractDocxText(file) {

        if (!window.mammoth) {

            throw new Error(
                'Mammoth.js failed to load. Check your internet connection.'
            );
        }


        const arrayBuffer =
            await file.arrayBuffer();


        const result =
            await window.mammoth
                .extractRawText({
                    arrayBuffer
                });


        return (
            result.value || ''
        ).trim();
    }


    // =========================================================
    // GENERAL FILE EXTRACTION
    // =========================================================

    async function extractTextFromFile(file) {

        if (
            file.size >
            MAX_FILE_SIZE
        ) {

            throw new Error(
                `File is larger than ${MAX_FILE_SIZE / 1024 / 1024} MB.`
            );
        }


        const ext =
            extensionOf(
                file.name
            );


        if (ext === 'docx') {

            return extractDocxText(
                file
            );
        }


        if (ext === 'pdf') {

            return extractPdfText(
                file
            );
        }


        if (
            SUPPORTED_TEXT.has(ext)
        ) {

            return file.text();
        }


        throw new Error(
            `Unsupported file type: .${ext || 'unknown'}`
        );
    }


    // =========================================================
    // ADD UPLOADED FILE TO TEXTAREA
    // =========================================================

    async function addFilesToTextarea(files) {

        const validFiles =
            Array.from(files || [])
                .filter(
                    file =>
                        !shouldIgnore(file)
                );


        if (!validFiles.length) {
            return;
        }


        const chunks = [];
        const errors = [];


        for (const file of validFiles) {

            try {

                const text =
                    await extractTextFromFile(
                        file
                    );


                if (!text.trim()) {
                    continue;
                }


                const name =
                    file.webkitRelativePath ||
                    file.name;


                chunks.push(
                    validFiles.length > 1 ||
                        file.webkitRelativePath
                        ? `\n===== FILE: ${name} =====\n${text}`
                        : text
                );


            } catch (error) {

                console.error(error);

                errors.push(
                    `${file.name}: ${error.message}`
                );
            }
        }


        if (chunks.length) {

            projectCodeInput.value =
                chunks
                    .join('\n\n')
                    .trim();
        }


        if (errors.length) {

            alert(
                `Some files could not be read:\n\n${errors
                    .slice(0, 8)
                    .join('\n')
                }`
            );
        }
    }


    // =========================================================
    // SAVE ORIGINAL UPLOADED FILE
    // =========================================================

    fileUpload?.addEventListener(
        'change',
        async (event) => {

            const files =
                Array.from(
                    event.target.files || []
                );


            if (files.length > 0) {

                // IMPORTANT:
                // Keep the original file so it can
                // be sent to the Python ML backend.
                state.currentFile =
                    files[0];
            }


            await addFilesToTextarea(
                files
            );


            event.target.value =
                '';
        }
    );


    folderUpload?.addEventListener(
        'change',
        async (event) => {

            const files =
                Array.from(
                    event.target.files || []
                );


            if (files.length > 0) {

                state.currentFile =
                    files[0];
            }


            await addFilesToTextarea(
                files
            );


            event.target.value =
                '';
        }
    );


    // =========================================================
    // OLD REFERENCE UPLOAD
    // Kept for compatibility but NOT REQUIRED anymore.
    // =========================================================

    referenceUpload?.addEventListener(
        'change',
        async (event) => {

            await addReferenceFiles(
                event.target.files
            );

            event.target.value =
                '';
        }
    );


    async function addReferenceFiles(files) {

        const validFiles =
            Array.from(files || [])
                .filter(
                    file =>
                        !shouldIgnore(file)
                );


        const errors = [];


        for (const file of validFiles) {

            try {

                const text =
                    await extractTextFromFile(
                        file
                    );


                if (!text.trim()) {
                    continue;
                }


                state.references.push({

                    id:
                        `${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2)}`,

                    name:
                        file.webkitRelativePath ||
                        file.name,

                    text
                });


            } catch (error) {

                console.error(error);

                errors.push(
                    `${file.name}: ${error.message}`
                );
            }
        }


        renderReferences();


        if (errors.length) {

            alert(
                `Some reference files could not be read:\n\n${errors
                    .slice(0, 8)
                    .join('\n')
                }`
            );
        }
    }


    // =========================================================
    // REFERENCE UI
    // =========================================================

    function renderReferences() {

        if (!referenceList) {
            return;
        }


        if (!state.references.length) {

            referenceList.innerHTML =
                `
                <div class="empty-reference">
                    No reference documents added.
                </div>
                `;

            return;
        }


        referenceList.innerHTML =
            state.references
                .map(
                    (ref, index) => `
                    <div class="reference-item">

                        <div>

                            <strong>
                                ${escapeHtml(
                        ref.name
                    )}
                            </strong>

                            <span>
                                ${formatNumber(
                        countWords(
                            ref.text
                        )
                    )}
                                words
                            </span>

                        </div>

                        <button
                            class="remove-reference"
                            data-index="${index}"
                            title="Remove"
                        >
                            Remove
                        </button>

                    </div>
                    `
                )
                .join('');


        referenceList
            .querySelectorAll(
                '.remove-reference'
            )
            .forEach(
                button => {

                    button.addEventListener(
                        'click',
                        () => {

                            state.references.splice(
                                Number(
                                    button.dataset.index
                                ),
                                1
                            );


                            renderReferences();
                        }
                    );
                }
            );
    }


    // =========================================================
    // TEXT UTILITIES
    // =========================================================

    function normalizeText(text) {

        return String(text || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/\u00ad/g, '')
            .replace(
                /[^\p{L}\p{N}]+/gu,
                ' '
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }


    function tokenize(text) {

        const settings =
            getSettings();


        const words =
            normalizeText(text)
                .split(' ')
                .filter(Boolean);


        return settings.ignoreShort
            ? words.filter(
                word =>
                    word.length >= 4
            )
            : words;
    }


    function countWords(text) {

        const normalized =
            normalizeText(text);


        if (!normalized) {
            return 0;
        }


        return normalized
            .split(' ')
            .filter(Boolean)
            .length;
    }


    function createNgrams(
        words,
        size
    ) {

        const grams = [];


        if (
            words.length <
            size
        ) {

            return grams;
        }


        for (
            let i = 0;
            i <= words.length - size;
            i++
        ) {

            grams.push(
                words
                    .slice(
                        i,
                        i + size
                    )
                    .join(' ')
            );
        }


        return grams;
    }


    // =========================================================
    // OLD LOCAL REFERENCE ANALYSIS
    // Kept as fallback only.
    // =========================================================

    function compareAgainstReference(
        sourceText,
        referenceText,
        sourceName
    ) {

        const sourceWords =
            tokenize(sourceText);


        const referenceWords =
            tokenize(referenceText);


        if (
            !sourceWords.length ||
            !referenceWords.length
        ) {

            return {
                score: 0,
                matchedWords: 0,
                matchedPhrases: 0,
                phrases: []
            };
        }


        const settings =
            getSettings();


        const n =
            settings.strict
                ? 8
                : 6;


        const sourceGrams =
            createNgrams(
                sourceWords,
                n
            );


        const referenceSet =
            new Set(
                createNgrams(
                    referenceWords,
                    n
                )
            );


        const matchingGrams =
            sourceGrams.filter(
                gram =>
                    referenceSet.has(
                        gram
                    )
            );


        const covered =
            new Set();


        const phrases = [];


        for (
            let i = 0;
            i <= sourceWords.length - n;
            i++
        ) {

            const gram =
                sourceWords
                    .slice(
                        i,
                        i + n
                    )
                    .join(' ');


            if (
                referenceSet.has(
                    gram
                )
            ) {

                for (
                    let j = i;
                    j < i + n;
                    j++
                ) {

                    covered.add(j);
                }


                if (
                    !phrases.includes(
                        gram
                    )
                ) {

                    phrases.push(
                        gram
                    );
                }
            }
        }


        const matchedWords =
            covered.size;


        const score =
            sourceWords.length
                ? Math.min(
                    100,
                    Math.round(
                        (
                            matchedWords /
                            sourceWords.length
                        ) * 100
                    )
                )
                : 0;


        return {

            score,

            matchedWords,

            matchedPhrases:
                matchingGrams.length,

            phrases:
                phrases
                    .slice(0, 8)
                    .map(
                        phrase => ({
                            phrase,
                            source:
                                sourceName
                        })
                    )
        };
    }


    function runPlagiarismAnalysis(
        text
    ) {

        if (!state.references.length) {

            return {

                hasCorpus: false,

                score: 0,

                matchedWords: 0,

                matchedPhrases: 0,

                sources: [],

                words:
                    countWords(text),

                lines:
                    text
                        .split(/\r?\n/)
                        .filter(
                            line =>
                                line.trim()
                        )
                        .length
            };
        }


        const sourceResults =
            state.references
                .map(
                    ref => {

                        const result =
                            compareAgainstReference(
                                text,
                                ref.text,
                                ref.name
                            );


                        return {
                            ...result,
                            name:
                                ref.name
                        };
                    }
                )
                .filter(
                    result =>
                        result.matchedWords > 0
                );


        sourceResults.sort(
            (a, b) =>
                b.score - a.score
        );


        return {

            hasCorpus: true,

            score:
                sourceResults[0]?.score ||
                0,

            matchedWords:
                sourceResults.reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        item.matchedWords,
                    0
                ),

            matchedPhrases:
                sourceResults.reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        item.matchedPhrases,
                    0
                ),

            sources:
                sourceResults.slice(
                    0,
                    10
                ),

            words:
                countWords(text),

            lines:
                text
                    .split(/\r?\n/)
                    .filter(
                        line =>
                            line.trim()
                    )
                    .length
        };
    }


    // =========================================================
    // ML BACKEND CONNECTION
    // =========================================================

    async function runMLPlagiarismAnalysis(
        text
    ) {

        let file =
            state.currentFile;


        // If user pasted text instead of
        // uploading a document, create a
        // temporary text file.
        if (!file) {

            file =
                new File(
                    [text],
                    'pasted-document.txt',
                    {
                        type:
                            'text/plain'
                    }
                );
        }


        const formData =
            new FormData();


        formData.append(
            'file',
            file
        );


        const response =
            await fetch(
                ML_API_URL,
                {
                    method:
                        'POST',

                    body:
                        formData
                }
            );


        if (!response.ok) {

            throw new Error(
                `ML backend error: HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.error ||
                'ML plagiarism analysis failed.'
            );
        }


        return data;
    }


    // =========================================================
    // CODE ANALYSIS
    // =========================================================

    function detectLanguage(text) {

        const selected =
            langSelect?.value ||
            'auto';


        if (
            selected !== 'auto'
        ) {

            return selected;
        }


        if (
            /\b(def|import|from)\b|print\(/.test(
                text
            )
        ) {

            return 'python';
        }


        if (
            /\b(const|let|var|function)\b|=>|console\.log/.test(
                text
            )
        ) {

            return 'javascript';
        }


        if (
            /\b(public|private|class|static|void|System\.out)\b/.test(
                text
            )
        ) {

            return 'java';
        }


        if (
            /#include\s*<|std::|cout\s*<</.test(
                text
            )
        ) {

            return 'cpp';
        }


        return 'unknown';
    }


    function runCodeAnalysis(
        code
    ) {

        const lines =
            code.split(/\r?\n/);


        const nonEmpty =
            lines.filter(
                line =>
                    line.trim()
            );


        const comments =
            nonEmpty.filter(
                line =>
                    /^\s*(\/\/|#|<!--|\/\*)/.test(
                        line
                    )
            ).length;


        const keywords =
            /\b(if|else|for|while|switch|case|catch|try)\b|&&|\|\||=>/g;


        const complexity =
            (
                code.match(
                    keywords
                ) || []
            ).length;


        const generic =
            (
                code.match(
                    /\b(calculate|compute|result|temp|helper|foo|bar|data|item|index|value)\b/gi
                ) || []
            ).length;


        const wordCount =
            countWords(code);


        const commentDensity =
            nonEmpty.length
                ? Math.round(
                    (
                        comments /
                        nonEmpty.length
                    ) * 100
                )
                : 0;


        const predictability =
            nonEmpty.length
                ? Math.min(
                    99,
                    Math.round(
                        30 +
                        (
                            generic /
                            nonEmpty.length
                        ) * 100 +
                        commentDensity
                    )
                )
                : 0;


        let score = 15;


        if (
            generic /
            Math.max(
                1,
                nonEmpty.length
            ) > 0.05
        ) {

            score += 20;
        }


        if (
            generic /
            Math.max(
                1,
                nonEmpty.length
            ) > 0.10
        ) {

            score += 15;
        }


        if (
            complexity /
            Math.max(
                1,
                nonEmpty.length
            ) < 0.05 &&
            nonEmpty.length > 20
        ) {

            score += 15;
        }


        if (
            commentDensity > 30
        ) {

            score += 10;
        }


        if (
            getSettings().strict
        ) {

            score += 10;
        }


        score =
            Math.max(
                0,
                Math.min(
                    99,
                    score
                )
            );


        return {

            score,

            patterns:
                generic,

            predictability,

            complexity,

            commentDensity,

            lines:
                nonEmpty.length,

            words:
                wordCount,

            language:
                detectLanguage(code)
        };
    }


    // =========================================================
    // MODE SWITCHING
    // =========================================================

    function setMode(
        mode
    ) {

        state.lastMode =
            mode;


        const codeMode =
            mode === 'code';


        // IMPORTANT:
        // Reference documents are no longer
        // required for plagiarism checking.
        if (referenceSection) {

            referenceSection
                .classList
                .add('hidden');
        }


        document
            .querySelectorAll(
                '.code-only-control'
            )
            .forEach(
                element => {

                    element.classList.toggle(
                        'hidden-control',
                        !codeMode
                    );
                }
            );


        if ($('primaryBadge')) {

            $('primaryBadge').textContent =
                codeMode
                    ? 'Project Source Code'
                    : 'Document to Check';
        }


        if ($('modeHelp')) {

            $('modeHelp').textContent =
                codeMode

                    ? 'This mode performs local heuristic source-code analysis. It is not proof of AI authorship.'

                    : 'Upload a document and the ML system will automatically search for potentially matching online sources.';
        }


        if (projectCodeInput) {

            projectCodeInput.placeholder =
                codeMode

                    ? 'Paste source code or upload files/folders to analyze...'

                    : 'Upload a DOCX/PDF/TXT document or paste text here...';
        }


        if (analyzeBtn) {

            const textElement =
                analyzeBtn.querySelector(
                    '.btn-text'
                );


            if (textElement) {

                textElement.textContent =
                    codeMode
                        ? 'Analyze Code'
                        : 'Check Plagiarism';
            }
        }


        hideResults();
    }


    analysisMode?.addEventListener(
        'change',
        () =>
            setMode(
                analysisMode.value
            )
    );


    // =========================================================
    // RESULT PANEL
    // =========================================================

    function hideResults() {

        resultsPanel?.classList.add(
            'hidden'
        );


        resultsPanel?.classList.remove(
            'visible'
        );
    }


    function showResults() {

        resultsPanel?.classList.remove(
            'hidden'
        );


        resultsPanel?.classList.add(
            'visible'
        );
    }


    // =========================================================
    // SCORE ANIMATION
    // =========================================================

    function animateScore(
        score,
        color
    ) {

        const progressCircle =
            $('progressCircle');


        const scoreElement =
            $('similarityScore');


        if (
            !progressCircle ||
            !scoreElement
        ) {

            return;
        }


        let current = 0;


        const step =
            Math.max(
                1,
                score / 50
            );


        const timer =
            setInterval(
                () => {

                    current +=
                        step;


                    if (
                        current >= score
                    ) {

                        current =
                            score;

                        clearInterval(
                            timer
                        );
                    }


                    scoreElement.textContent =
                        `${Math.round(current)}%`;


                    progressCircle.style.background =
                        `conic-gradient(
                            ${color}
                            ${current * 3.6}deg,
                            var(--bg-primary)
                            0deg
                        )`;

                },
                20
            );
    }


    function scoreColor(
        score
    ) {

        if (
            score >= 50
        ) {

            return 'var(--danger)';
        }


        if (
            score >= 20
        ) {

            return 'var(--warning)';
        }


        return 'var(--success)';
    }


    // =========================================================
    // ML PLAGIARISM RESULT DISPLAY
    // =========================================================

    function renderPlagiarismResults(
        report
    ) {

        const score =
            Number(
                report.similarity ??
                report.score ??
                0
            );


        const sources =
            Array.isArray(
                report.results
            )
                ? report.results
                : [];


        const matchedWords =
            Number(
                report.matchedWords ||
                0
            );


        const matchedPhrases =
            Number(
                report.matchedPhrases ||
                0
            );


        const wordsAnalyzed =
            Number(
                report.words_analyzed ||
                report.words ||
                countWords(
                    projectCodeInput.value
                )
            );


        const sourcesChecked =
            Number(
                report.sources_checked ||
                sources.length ||
                0
            );


        if ($('resultsTitle')) {

            $('resultsTitle').textContent =
                'ML Plagiarism Analysis Results';
        }


        if ($('scoreTitle')) {

            $('scoreTitle').textContent =
                'Similarity';
        }


        if ($('metricOneLabel')) {

            $('metricOneLabel').textContent =
                'Matching Words';
        }


        if ($('metricTwoLabel')) {

            $('metricTwoLabel').textContent =
                'Online Sources';
        }


        if ($('metricThreeLabel')) {

            $('metricThreeLabel').textContent =
                'Matched Phrases';
        }


        if ($('metricFourLabel')) {

            $('metricFourLabel').textContent =
                'Words Analyzed';
        }


        if ($('metricFiveLabel')) {

            $('metricFiveLabel').textContent =
                'Sources Checked';
        }


        if ($('metricOneValue')) {

            $('metricOneValue').textContent =
                formatNumber(
                    matchedWords
                );
        }


        if ($('metricTwoValue')) {

            $('metricTwoValue').textContent =
                formatNumber(
                    sourcesChecked
                );
        }


        if ($('metricThreeValue')) {

            $('metricThreeValue').textContent =
                formatNumber(
                    matchedPhrases
                );
        }


        if ($('metricFourValue')) {

            $('metricFourValue').textContent =
                formatNumber(
                    wordsAnalyzed
                );
        }


        if ($('metricFiveValue')) {

            $('metricFiveValue').textContent =
                formatNumber(
                    sourcesChecked
                );
        }


        // Remove old "reference corpus required" message.
        noCorpusNotice?.classList.add(
            'hidden'
        );


        $('codeDetailsPanel')?.classList.add(
            'hidden'
        );


        // =====================================================
        // SCORE STATUS
        // =====================================================

        let status;
        let statusClass;
        let riskLabel;


        if (
            score >= 70
        ) {

            status =
                'High Similarity Detected';

            statusClass =
                'danger';

            riskLabel =
                'High Similarity';

        } else if (
            score >= 40
        ) {

            status =
                'Potential Plagiarism Detected';

            statusClass =
                'danger';

            riskLabel =
                'Potential Plagiarism';

        } else if (
            score >= 20
        ) {

            status =
                'Some Similarity Found';

            statusClass =
                'warning';

            riskLabel =
                'Moderate Similarity';

        } else {

            status =
                'No Significant Match Found';

            statusClass =
                'safe';

            riskLabel =
                'Low Similarity';
        }


        if ($('statusText')) {

            $('statusText').textContent =
                status;

            $('statusText').className =
                `status-text ${statusClass}`;
        }


        if ($('riskLabel')) {

            $('riskLabel').textContent =
                riskLabel;
        }


        if ($('riskFill')) {

            $('riskFill').style.width =
                `${score}%`;

            $('riskFill').style.backgroundColor =
                scoreColor(score);
        }


        animateScore(
            score,
            scoreColor(score)
        );


        // =====================================================
        // ONLINE MATCHES
        // =====================================================

        if (!matchesList) {
            return;
        }


        if (
            sources.length
        ) {

            matchesPanel?.classList.remove(
                'hidden'
            );


            matchesList.innerHTML =
                sources
                    .map(
                        (source, index) => {

                            const sourceScore =
                                Number(
                                    source.similarity ||
                                    0
                                );


                            const phrases =
                                Array.isArray(
                                    source.matched_phrases
                                )
                                    ? source.matched_phrases
                                    : [];


                            return `

                            <div class="match-card">

                                <div class="match-card-head">

                                    <strong>

                                        ${index + 1}.
                                        ${escapeHtml(
                                source.title ||
                                'Online Source'
                            )}

                                    </strong>

                                    <span class="match-score">

                                        ${sourceScore}%

                                    </span>

                                </div>


                                <div class="match-meta">

                                    Semantic:
                                    ${Number(
                                source.semantic_similarity ||
                                0
                            ).toFixed(2)}%

                                    &nbsp; | &nbsp;

                                    TF-IDF:
                                    ${Number(
                                source.tfidf_similarity ||
                                0
                            ).toFixed(2)}%

                                    &nbsp; | &nbsp;

                                    Phrase:
                                    ${Number(
                                source.phrase_similarity ||
                                0
                            ).toFixed(2)}%

                                </div>


                                ${source.url
                                    ? `
                                        <div class="match-url">

                                            <a
                                                href="${escapeHtml(
                                        source.url
                                    )}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View Source
                                            </a>

                                        </div>
                                        `
                                    : ''
                                }


                                ${phrases.length
                                    ? `

                                        <div class="matched-phrases">

                                            <strong>
                                                Matching phrases:
                                            </strong>

                                            <ul>

                                                ${phrases
                                        .slice(
                                            0,
                                            10
                                        )
                                        .map(
                                            phrase =>
                                                `
                                                                <li>
                                                                    ${escapeHtml(
                                                    phrase
                                                )}
                                                                </li>
                                                                `
                                        )
                                        .join('')
                                    }

                                            </ul>

                                        </div>

                                        `
                                    : ''
                                }

                            </div>

                            `;
                        }
                    )
                    .join('');


        } else {

            matchesPanel?.classList.remove(
                'hidden'
            );


            matchesList.innerHTML =
                `

                <div class="empty-reference">

                    No matching online sources were found.

                </div>

                `;
        }


        if ($('matchSummary')) {

            $('matchSummary').textContent =
                sources.length

                    ? `${sources.length} online source(s) analyzed`

                    : 'No matching online sources found';
        }
    }


    // =========================================================
    // CODE RESULT DISPLAY
    // =========================================================

    function renderCodeResults(
        report
    ) {

        if ($('resultsTitle')) {

            $('resultsTitle').textContent =
                'Code Analysis Results';
        }


        if ($('scoreTitle')) {

            $('scoreTitle').textContent =
                'Heuristic AI Probability';
        }


        if ($('metricOneLabel')) {

            $('metricOneLabel').textContent =
                'AI-like Patterns';
        }


        if ($('metricTwoLabel')) {

            $('metricTwoLabel').textContent =
                'Detected Language';
        }


        if ($('metricThreeLabel')) {

            $('metricThreeLabel').textContent =
                'Logical Complexity';
        }


        if ($('metricFourLabel')) {

            $('metricFourLabel').textContent =
                'Comment Density';
        }


        if ($('metricFiveLabel')) {

            $('metricFiveLabel').textContent =
                'Lines Analyzed';
        }


        if ($('metricOneValue')) {

            $('metricOneValue').textContent =
                report.patterns;
        }


        if ($('metricTwoValue')) {

            $('metricTwoValue').textContent =
                report.language;
        }


        if ($('metricThreeValue')) {

            $('metricThreeValue').textContent =
                report.complexity;
        }


        if ($('metricFourValue')) {

            $('metricFourValue').textContent =
                `${report.commentDensity}%`;
        }


        if ($('metricFiveValue')) {

            $('metricFiveValue').textContent =
                report.lines;
        }


        noCorpusNotice?.classList.add(
            'hidden'
        );


        matchesPanel?.classList.add(
            'hidden'
        );


        const color =
            report.score >= 75
                ? 'var(--danger)'
                : report.score >= 40
                    ? 'var(--warning)'
                    : 'var(--success)';


        const status =
            report.score >= 75
                ? 'High heuristic AI signal'
                : report.score >= 40
                    ? 'Mixed heuristic signal'
                    : 'Low heuristic signal';


        if ($('statusText')) {

            $('statusText').textContent =
                status;

            $('statusText').className =
                `status-text ${report.score >= 75
                    ? 'danger'
                    : report.score >= 40
                        ? 'warning'
                        : 'safe'
                }`;
        }


        if ($('riskLabel')) {

            $('riskLabel').textContent =
                'Heuristic score — not proof of authorship';
        }


        if ($('riskFill')) {

            $('riskFill').style.width =
                `${report.score}%`;

            $('riskFill').style.backgroundColor =
                color;
        }


        animateScore(
            report.score,
            color
        );


        const list =
            $('codeDetailsList');


        if (list) {

            list.innerHTML = [

                `Detected language: ${report.language}`,

                `Code predictability metric: ${report.predictability}%`,

                `AI-like keyword/pattern count: ${report.patterns}`,

                `Logical structure count: ${report.complexity}`,

                'This score is a local heuristic and should not be presented as definitive AI-authorship evidence.'

            ]
                .map(
                    text =>
                        `<li><span>${escapeHtml(text)}</span></li>`
                )
                .join('');


            $('codeDetailsPanel')?.classList.remove(
                'hidden'
            );
        }
    }


    // =========================================================
    // MAIN ANALYZE BUTTON
    // =========================================================

    analyzeBtn?.addEventListener(
        'click',
        async () => {

            const text =
                projectCodeInput
                    ?.value
                    ?.trim() || '';


            if (!text) {

                alert(
                    'Please upload a document or paste text first.'
                );

                return;
            }


            analyzeBtn.disabled =
                true;


            analyzeBtn.style.opacity =
                '0.7';


            const buttonText =
                analyzeBtn.querySelector(
                    '.btn-text'
                );


            if (buttonText) {

                buttonText.textContent =
                    'Analyzing...';
            }


            try {

                // Small UI delay
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            250
                        )
                );


                let report;


                // =================================================
                // CODE MODE
                // =================================================

                if (
                    analysisMode?.value ===
                    'code'
                ) {

                    report =
                        runCodeAnalysis(
                            text
                        );


                    renderCodeResults(
                        report
                    );


                    state.lastMode =
                        'code';


                }

                // =================================================
                // ML PLAGIARISM MODE
                // =================================================

                else {

                    report =
                        await runMLPlagiarismAnalysis(
                            text
                        );


                    renderPlagiarismResults(
                        report
                    );


                    state.lastMode =
                        'plagiarism';
                }


                state.lastReport =
                    report;


                // =================================================
                // SAVE HISTORY
                // =================================================

                saveToHistory({

                    mode:
                        state.lastMode,

                    score:
                        Number(
                            report.similarity ??
                            report.score ??
                            0
                        ),

                    words:
                        Number(
                            report.words_analyzed ??
                            report.words ??
                            countWords(text)
                        ),

                    sources:
                        Number(
                            report.sources_checked ??
                            report.results?.length ??
                            report.sources?.length ??
                            0
                        ),

                    date:
                        new Date()
                            .toLocaleString()
                });


                showResults();


            } catch (error) {

                console.error(
                    'Analysis error:',
                    error
                );


                alert(
                    `Analysis failed:\n\n${error.message}`
                );


            } finally {

                analyzeBtn.disabled =
                    false;


                analyzeBtn.style.opacity =
                    '1';


                if (buttonText) {

                    buttonText.textContent =
                        analysisMode?.value ===
                            'code'
                            ? 'Analyze Code'
                            : 'Check Plagiarism';
                }
            }
        }
    );


    // =========================================================
    // REPORT HTML
    // =========================================================

    function buildReportHtml() {

        const report =
            state.lastReport;


        if (!report) {
            return null;
        }


        const mode =
            state.lastMode;


        const score =
            Number(
                report.similarity ??
                report.score ??
                0
            );


        const sourceName =
            mode === 'plagiarism'
                ? 'ML Plagiarism Analysis Report'
                : 'Code Analysis Report';


        const rows =
            mode === 'plagiarism'

                ? `

                    <tr>
                        <td>Similarity</td>
                        <td>${score}%</td>
                    </tr>

                    <tr>
                        <td>Matching Words</td>
                        <td>
                            ${formatNumber(
                    report.matchedWords || 0
                )}
                        </td>
                    </tr>

                    <tr>
                        <td>Online Sources</td>
                        <td>
                            ${report.results?.length ||
                0
                }
                        </td>
                    </tr>

                    <tr>
                        <td>Matched Phrases</td>
                        <td>
                            ${formatNumber(
                    report.matchedPhrases || 0
                )}
                        </td>
                    </tr>

                    <tr>
                        <td>Words Analyzed</td>
                        <td>
                            ${formatNumber(
                    report.words_analyzed ||
                    report.words ||
                    0
                )}
                        </td>
                    </tr>

                `

                : `

                    <tr>
                        <td>Heuristic AI Probability</td>
                        <td>${score}%</td>
                    </tr>

                    <tr>
                        <td>Detected Language</td>
                        <td>
                            ${escapeHtml(
                    report.language
                )}
                        </td>
                    </tr>

                    <tr>
                        <td>AI-like Patterns</td>
                        <td>
                            ${report.patterns}
                        </td>
                    </tr>

                    <tr>
                        <td>Logical Complexity</td>
                        <td>
                            ${report.complexity}
                        </td>
                    </tr>

                    <tr>
                        <td>Comment Density</td>
                        <td>
                            ${report.commentDensity}%
                        </td>
                    </tr>

                `;


        const sources =
            (
                report.results ||
                []
            )
                .map(
                    source =>
                        `
                        <li>
                            ${escapeHtml(
                            source.title ||
                            'Online Source'
                        )}
                            —
                            ${source.similarity || 0}%
                        </li>
                        `
                )
                .join('');


        return `

        <!doctype html>

        <html>

        <head>

            <meta charset="utf-8">

            <title>
                ${sourceName}
            </title>

            <style>

                body {
                    font-family:
                        Arial,
                        sans-serif;

                    max-width:
                        850px;

                    margin:
                        40px auto;

                    color:
                        #111;

                    line-height:
                        1.5;
                }

                h1 {
                    margin-bottom:
                        4px;
                }

                small {
                    color:
                        #666;
                }

                .score {
                    font-size:
                        42px;

                    font-weight:
                        700;

                    margin:
                        24px 0;
                }

                table {
                    width:
                        100%;

                    border-collapse:
                        collapse;

                    margin:
                        20px 0;
                }

                td {
                    padding:
                        10px;

                    border:
                        1px solid #ddd;
                }

                td:first-child {
                    font-weight:
                        600;
                }

                li {
                    margin:
                        8px 0;
                }

                .note {
                    padding:
                        14px;

                    background:
                        #f3f4f6;

                    border-left:
                        4px solid #555;
                }

            </style>

        </head>


        <body>

            <h1>
                ${sourceName}
            </h1>


            <small>
                Generated by ML Plagiarism Checker ·
                ${new Date().toLocaleString()}
            </small>


            <div class="score">

                Similarity:
                ${score}%

            </div>


            <table>

                ${rows}

            </table>


            ${sources
                ? `
                        <h2>
                            Matching Online Sources
                        </h2>

                        <ul>
                            ${sources}
                        </ul>
                    `
                : ''
            }


            <div class="note">

                ${mode === 'plagiarism'

                ? 'This report uses machine-learning similarity analysis and automatically discovered online sources. Similarity is not by itself proof of plagiarism; matched sources should be reviewed.'

                : 'This is a local heuristic code-analysis score. It is not definitive evidence that code was or was not generated by AI.'
            }

            </div>

        </body>

        </html>

        `;
    }


    // =========================================================
    // DOWNLOAD REPORT
    // =========================================================

    $('downloadReportBtn')?.addEventListener(
        'click',
        () => {

            const html =
                buildReportHtml();


            if (!html) {

                alert(
                    'Run an analysis first.'
                );

                return;
            }


            const blob =
                new Blob(
                    [html],
                    {
                        type:
                            'text/html;charset=utf-8'
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const a =
                document.createElement(
                    'a'
                );


            a.href =
                url;


            a.download =
                `plagiarism-report-${Date.now()}.html`;


            a.click();


            URL.revokeObjectURL(
                url
            );
        }
    );


    // =========================================================
    // PRINT REPORT
    // =========================================================

    $('printReportBtn')?.addEventListener(
        'click',
        () => {

            const html =
                buildReportHtml();


            if (!html) {

                alert(
                    'Run an analysis first.'
                );

                return;
            }


            const win =
                window.open(
                    '',
                    '_blank',
                    'width=900,height=700'
                );


            if (!win) {

                alert(
                    'Please allow pop-ups to print the report.'
                );

                return;
            }


            win.document.write(
                html
            );


            win.document.close();


            win.focus();


            setTimeout(
                () =>
                    win.print(),
                300
            );
        }
    );


    // =========================================================
    // HISTORY
    // =========================================================

    function saveToHistory(
        item
    ) {

        let history = [];


        try {

            history =
                JSON.parse(
                    localStorage.getItem(
                        'codeGuardHistory'
                    ) || '[]'
                );

        } catch {

            history = [];
        }


        history.unshift({

            id:
                Date.now(),

            ...item
        });


        localStorage.setItem(

            'codeGuardHistory',

            JSON.stringify(
                history.slice(
                    0,
                    50
                )
            )
        );
    }


    function loadHistory() {

        const list =
            $('historyList');


        if (!list) {
            return;
        }


        let history = [];


        try {

            history =
                JSON.parse(
                    localStorage.getItem(
                        'codeGuardHistory'
                    ) || '[]'
                );

        } catch {

            history = [];
        }


        if (!history.length) {

            list.innerHTML =
                `
                <div class="empty-history">
                    No analysis history found.
                </div>
                `;


            $('clearHistoryBtn')
                ?.classList
                .add('hidden');


            return;
        }


        $('clearHistoryBtn')
            ?.classList
            .remove('hidden');


        list.innerHTML =
            history
                .map(
                    item => {

                        const score =
                            Number(
                                item.score ||
                                0
                            );


                        const color =
                            score >= 50
                                ? 'danger'
                                : score >= 20
                                    ? 'warning'
                                    : 'safe';


                        const isPlagiarism =
                            item.mode ===
                            'plagiarism';


                        return `

                        <div class="history-item">

                            <div class="history-info">

                                <h4>

                                    ${isPlagiarism
                                ? 'ML Plagiarism Check'
                                : 'Code Analysis'
                            }

                                </h4>


                                <div class="history-meta">

                                    ${escapeHtml(
                                item.date || ''
                            )}

                                    ·

                                    ${formatNumber(
                                item.words || 0
                            )}
                                    words

                                    ·

                                    ${item.sources || 0}
                                    source(s)

                                </div>

                            </div>


                            <div class="history-score">

                                <span
                                    class="score-value ${color}"
                                >

                                    ${score}%

                                </span>


                                <span
                                    class="status-text ${color}"
                                >

                                    ${isPlagiarism
                                ? 'Similarity'
                                : 'Heuristic'
                            }

                                </span>

                            </div>

                        </div>

                        `;
                    }
                )
                .join('');
    }


    $('clearHistoryBtn')?.addEventListener(
        'click',
        () => {

            localStorage.removeItem(
                'codeGuardHistory'
            );


            loadHistory();
        }
    );


    // =========================================================
    // NAVIGATION
    // =========================================================

    function switchTab(
        tab
    ) {

        $('navScanner')
            ?.classList
            .remove('active');


        $('navHistory')
            ?.classList
            .remove('active');


        $('navSettings')
            ?.classList
            .remove('active');


        if (scannerPanel) {

            scannerPanel.style.display =
                'none';
        }


        historyPanel
            ?.classList
            .add('hidden');


        settingsPanel
            ?.classList
            .add('hidden');


        resultsPanel
            ?.classList
            .add('hidden');


        if (
            tab ===
            'scanner'
        ) {

            $('navScanner')
                ?.classList
                .add('active');


            if (scannerPanel) {

                scannerPanel.style.display =
                    'flex';
            }


            if (state.lastReport) {

                resultsPanel
                    ?.classList
                    .remove('hidden');
            }


        } else if (
            tab ===
            'history'
        ) {

            $('navHistory')
                ?.classList
                .add('active');


            historyPanel
                ?.classList
                .remove('hidden');


            loadHistory();


        } else {

            $('navSettings')
                ?.classList
                .add('active');


            settingsPanel
                ?.classList
                .remove('hidden');


            loadSettings();
        }
    }


    $('navScanner')?.addEventListener(
        'click',
        event => {

            event.preventDefault();

            switchTab(
                'scanner'
            );
        }
    );


    $('navHistory')?.addEventListener(
        'click',
        event => {

            event.preventDefault();

            switchTab(
                'history'
            );
        }
    );


    $('navSettings')?.addEventListener(
        'click',
        event => {

            event.preventDefault();

            switchTab(
                'settings'
            );
        }
    );


    // =========================================================
    // HELPERS
    // =========================================================

    function formatNumber(
        value
    ) {

        return Number(
            value || 0
        ).toLocaleString();
    }


    function escapeHtml(
        value
    ) {

        return String(
            value ?? ''
        )
            .replaceAll(
                '&',
                '&amp;'
            )
            .replaceAll(
                '<',
                '&lt;'
            )
            .replaceAll(
                '>',
                '&gt;'
            )
            .replaceAll(
                '"',
                '&quot;'
            )
            .replaceAll(
                "'",
                '&#039;'
            );
    }


    // =========================================================
    // INITIALIZATION
    // =========================================================

    loadSettings();

    setMode(
        'plagiarism'
    );

    renderReferences();

});