document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const codeAInput = document.getElementById('codeA');
    const codeBInput = document.getElementById('codeB');
    const resultsPanel = document.getElementById('resultsPanel');
    
    // Result elements
    const similarityScore = document.getElementById('similarityScore');
    const progressCircle = document.getElementById('progressCircle');
    const statusText = document.getElementById('statusText');
    const exactMatches = document.getElementById('exactMatches');
    const structSim = document.getElementById('structSim');
    const linesCount = document.getElementById('linesCount');
    const riskFill = document.getElementById('riskFill');
    const riskLabel = document.getElementById('riskLabel');

    analyzeBtn.addEventListener('click', () => {
        const codeA = codeAInput.value;
        const codeB = codeBInput.value;

        if (!codeA.trim() || !codeB.trim()) {
            alert('Please paste code in both editors to analyze.');
            return;
        }

        // Show panel if hidden
        resultsPanel.classList.remove('hidden');
        resultsPanel.classList.add('visible');
        
        // Reset animation
        progressCircle.style.background = `conic-gradient(var(--bg-primary) 0deg, var(--bg-primary) 0deg)`;
        similarityScore.textContent = '0%';
        
        // Disable button during analysis
        analyzeBtn.disabled = true;
        analyzeBtn.style.opacity = '0.7';

        // Simulate a slight delay for "analysis" feeling and UI updating
        setTimeout(() => {
            performAnalysis(codeA, codeB);
            analyzeBtn.disabled = false;
            analyzeBtn.style.opacity = '1';
        }, 800);
    });

    function performAnalysis(codeA, codeB) {
        // 1. Basic cleaning and tokenization
        const tokensA = tokenize(codeA);
        const tokensB = tokenize(codeB);
        
        // 2. Lines analysis
        const linesA = codeA.split('\n').filter(l => l.trim().length > 0).length;
        const linesB = codeB.split('\n').filter(l => l.trim().length > 0).length;
        linesCount.textContent = `${linesA} / ${linesB}`;

        // 3. Jaccard Similarity on n-grams (Shingling)
        const n = 3; // 3-grams
        const nGramsA = getNGrams(tokensA, n);
        const nGramsB = getNGrams(tokensB, n);
        
        let intersection = 0;
        const setB = new Set(nGramsB);
        
        // Count exact n-gram matches
        nGramsA.forEach(gram => {
            if (setB.has(gram)) {
                intersection++;
            }
        });

        const union = new Set([...nGramsA, ...nGramsB]).size;
        
        let similarity = 0;
        if (union > 0) {
            similarity = (intersection / union) * 100;
        } else if (tokensA.length === 0 && tokensB.length === 0) {
            similarity = 100;
        }

        // Boost similarity slightly if structural tokens match (simplified)
        const structA = getStructuralTokens(codeA);
        const structB = getStructuralTokens(codeB);
        const structSimScore = calculateSetSimilarity(new Set(structA), new Set(structB));
        
        // Final weighted score
        let finalScore = (similarity * 0.7) + (structSimScore * 0.3);
        
        // Cap at 100 and round
        finalScore = Math.min(100, Math.round(finalScore));

        exactMatches.textContent = intersection;
        structSim.textContent = Math.round(structSimScore) + '%';
        
        updateUI(finalScore);
    }

    function tokenize(text) {
        // Lowercase, remove comments (basic), extract words/symbols
        text = text.toLowerCase();
        // Remove single line comments (//) and block comments (/* */)
        text = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        // Remove python comments (#)
        text = text.replace(/#.*/g, '');
        // Tokenize by word characters or specific operators
        return text.match(/\w+|[^\s\w]/g) || [];
    }

    function getNGrams(tokens, n) {
        const nGrams = [];
        for (let i = 0; i <= tokens.length - n; i++) {
            nGrams.push(tokens.slice(i, i + n).join(' '));
        }
        return nGrams;
    }

    function getStructuralTokens(text) {
        // Extract brackets, braces, parentheses, and common keywords
        const keywords = ['if', 'else', 'for', 'while', 'function', 'return', 'class', 'import', 'def', 'const', 'let', 'var'];
        const tokens = tokenize(text);
        return tokens.filter(t => keywords.includes(t) || ['{','}','(',')','[',']'].includes(t));
    }

    function calculateSetSimilarity(setA, setB) {
        let intersection = 0;
        for (let elem of setA) {
            if (setB.has(elem)) intersection++;
        }
        let union = new Set([...setA, ...setB]).size;
        return union === 0 ? 0 : (intersection / union) * 100;
    }

    function updateUI(score) {
        // Animate circular progress
        let currentScore = 0;
        const duration = 1500;
        const intervalTime = 20;
        const steps = duration / intervalTime;
        const increment = score / steps;

        // Determine colors based on score
        let color = 'var(--success)';
        let status = 'Safe - Original Work';
        let riskText = 'Low Risk';
        statusText.className = 'status-text safe';

        if (score >= 40 && score < 70) {
            color = 'var(--warning)';
            status = 'Warning - Moderate Similarity';
            riskText = 'Moderate Risk';
            statusText.className = 'status-text warning';
        } else if (score >= 70) {
            color = 'var(--danger)';
            status = 'Danger - High Probability of Plagiarism';
            riskText = 'High Risk';
            statusText.className = 'status-text danger';
        }

        statusText.textContent = status;
        riskLabel.textContent = riskText;
        riskFill.style.width = `${score}%`;
        riskFill.style.backgroundColor = color;

        const timer = setInterval(() => {
            currentScore += increment;
            if (currentScore >= score) {
                currentScore = score;
                clearInterval(timer);
            }
            
            similarityScore.textContent = Math.round(currentScore) + '%';
            progressCircle.style.background = `conic-gradient(${color} ${currentScore * 3.6}deg, var(--bg-primary) 0deg)`;
        }, intervalTime);
    }
});
