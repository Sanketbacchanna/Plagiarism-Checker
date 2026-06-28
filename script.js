document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const projectCodeInput = document.getElementById('projectCode');
    const resultsPanel = document.getElementById('resultsPanel');
    
    // File inputs
    const fileUpload = document.getElementById('fileUpload');
    const folderUpload = document.getElementById('folderUpload');

    const handleFileUpload = async (event, textArea) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        let combinedCode = "";
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Skip common ignore directories
            if (file.webkitRelativePath) {
                const path = file.webkitRelativePath;
                if (path.includes('/node_modules/') || path.includes('/.git/') || path.includes('/.idea/') || path.includes('/.vscode/')) {
                    continue;
                }
            }

            // Skip large files to prevent browser freeze
            if (file.size > 1024 * 1024) continue; // max 1MB per file
            
            try {
                const text = await file.text();
                // Basic check to see if it looks like binary
                if (text.includes('\x00')) continue;
                
                if (files.length > 1 || file.webkitRelativePath) {
                    const name = file.webkitRelativePath || file.name;
                    combinedCode += `// === File: ${name} ===\n`;
                }
                combinedCode += text + "\n\n";
            } catch (err) {
                console.error("Error reading file", file.name, err);
            }
        }
        
        if (combinedCode) {
            textArea.value = combinedCode.trim();
        } else {
            alert('No valid text files found.');
        }
        
        // Reset input so the same file can be selected again
        event.target.value = '';
    };

    if(fileUpload) fileUpload.addEventListener('change', (e) => handleFileUpload(e, projectCodeInput));
    if(folderUpload) folderUpload.addEventListener('change', (e) => handleFileUpload(e, projectCodeInput));
    
    // Result elements
    const similarityScore = document.getElementById('similarityScore');
    const progressCircle = document.getElementById('progressCircle');
    const statusText = document.getElementById('statusText');
    const aiPatterns = document.getElementById('aiPatterns');
    const predictability = document.getElementById('predictability');
    const linesCount = document.getElementById('linesCount');
    const riskFill = document.getElementById('riskFill');
    const riskLabel = document.getElementById('riskLabel');

    if(analyzeBtn) analyzeBtn.addEventListener('click', () => {
        const code = projectCodeInput.value;

        if (!code.trim()) {
            alert('Please paste code or upload a project to analyze.');
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
            performAIAnalysis(code);
            analyzeBtn.disabled = false;
            analyzeBtn.style.opacity = '1';
        }, 1200);
    });

    const logicalComplexity = document.getElementById('logicalComplexity');
    const commentDensity = document.getElementById('commentDensity');

    function performAIAnalysis(code) {
        if (!code) return;

        const lines = code.split('\n');
        const nonEmptyLines = lines.filter(l => l.trim().length > 0);
        const numLines = nonEmptyLines.length;
        if(linesCount) linesCount.textContent = `${numLines}`;

        if (numLines === 0) {
            updateUI(0);
            return;
        }

        // 1. Comment Density
        let commentLines = 0;
        let inBlockComment = false;
        
        // 2. Cyclomatic Complexity & Logical structure
        let complexity = 0;
        const keywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', '&&', '||', '=>'];
        
        // 3. AI specific patterns / Generic variables
        const aiKeywords = ['calculate', 'compute', 'result', 'temp', 'helper', 'foo', 'bar', 'data', 'item', 'index', 'value'];
        let aiPatternCount = 0;
        
        // 4. Uniformity (predictability) - line lengths
        let totalLineLength = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (trimmed.length === 0) continue;
            totalLineLength += trimmed.length;

            // Comments
            if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
                commentLines++;
            } else if (trimmed.startsWith('/*')) {
                inBlockComment = true;
                commentLines++;
            } else if (trimmed.endsWith('*/') && inBlockComment) {
                inBlockComment = false;
                commentLines++;
            } else if (inBlockComment) {
                commentLines++;
            }

            // Complexity
            const words = trimmed.split(/[\s\(\)\{\}\[\]\;\,]+/);
            words.forEach(w => {
                if (keywords.includes(w)) complexity++;
            });
            if (trimmed.includes('&&')) complexity++;
            if (trimmed.includes('||')) complexity++;
            if (trimmed.includes('=>')) complexity++;

            // AI Patterns
            const lowerLine = trimmed.toLowerCase();
            aiKeywords.forEach(kw => {
                const regex = new RegExp(`\\b${kw}\\b`);
                if (regex.test(lowerLine)) aiPatternCount++;
            });
        }

        const avgLineLength = numLines > 0 ? totalLineLength / numLines : 0;
        const commentRatio = numLines > 0 ? commentLines / numLines : 0;

        // Calculate a more realistic score based on heuristics
        let aiScore = 0;

        // Rule 1: High comment density without corresponding complexity might be AI
        if (commentRatio > 0.15) aiScore += 15;
        if (commentRatio > 0.3) aiScore += 20;
        
        // Very low comments can sometimes be human (or very raw AI)
        if (commentRatio < 0.05 && numLines > 20) aiScore -= 10;

        // Rule 2: Usage of generic variables (aiPatternCount) vs total lines
        const patternDensity = aiPatternCount / numLines;
        if (patternDensity > 0.05) aiScore += 25;
        if (patternDensity > 0.1) aiScore += 15;

        // Rule 3: Cyclomatic complexity density
        const complexityDensity = complexity / numLines;
        if (complexityDensity < 0.05 && numLines > 20) {
            // Highly verbose but simple logic is often AI
            aiScore += 25;
        } else if (complexityDensity > 0.3) {
            // Highly complex/dense logic leans human (or very advanced prompt)
            aiScore -= 15;
        }

        // Rule 4: Average line length is very consistent with standard formatting
        if (avgLineLength > 30 && avgLineLength < 50) aiScore += 15;

        // Structural predictability based on metrics
        let predictScore = 30 + (patternDensity * 100) + (commentRatio * 100);
        predictScore = Math.min(99, Math.round(predictScore));

        // Generate a stable hash to add some jitter
        let hash = 0;
        for (let i = 0; i < Math.min(code.length, 500); i++) {
            hash = ((hash << 5) - hash) + code.charCodeAt(i);
            hash = hash & hash;
        }
        
        // Apply jitter and bounds
        aiScore += Math.abs(hash % 10);
        aiScore = Math.max(5, Math.min(99, Math.round(aiScore)));
        
        if (numLines < 5) {
            aiScore = Math.abs(hash % 30);
            predictScore = Math.abs(hash % 40);
        }

        // Update dom elements
        if(aiPatterns) aiPatterns.textContent = aiPatternCount;
        if(predictability) predictability.textContent = `${predictScore}%`;
        if(logicalComplexity) logicalComplexity.textContent = complexity;
        if(commentDensity) commentDensity.textContent = `${Math.round(commentRatio * 100)}%`;

        updateUI(aiScore);
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
        let status = 'Likely Human Written';
        let riskText = 'Low AI Probability';
        statusText.className = 'status-text safe';

        if (score >= 40 && score < 75) {
            color = 'var(--warning)';
            status = 'Mixed / Partially AI Generated';
            riskText = 'Moderate AI Probability';
            statusText.className = 'status-text warning';
            showRecommendations(score);
        } else if (score >= 75) {
            color = 'var(--danger)';
            status = 'Highly Likely AI Generated';
            riskText = 'High AI Probability';
            statusText.className = 'status-text danger';
            showRecommendations(score);
        } else {
            hideRecommendations();
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

    function showRecommendations(score) {
        const recommendationsPanel = document.getElementById('recommendationsPanel');
        const recommendationsList = document.getElementById('recommendationsList');
        if(!recommendationsPanel || !recommendationsList) return;

        recommendationsPanel.classList.remove('hidden');
        recommendationsList.innerHTML = '';

        const tips = [
            "Add custom, meaningful comments explaining the 'why' behind the logic, not just 'what' the code does.",
            "Refactor standard boilerplate structures into more custom, project-specific abstractions.",
            "Incorporate unique variable and function names that map directly to your specific business domain.",
            "Avoid generic variable names like 'temp', 'data', 'helper', or 'result' commonly used by AI.",
            "Use less predictable control flows where appropriate to break generic algorithmic patterns.",
            "Write custom error handling with specific edge cases instead of using generic try-catch blocks."
        ];

        // Give more tips for higher scores
        let numTips = score >= 75 ? 4 : 2;
        
        // Randomly select tips based on a simple pseudo-random approach using the score to keep it stable
        for(let i=0; i<numTips; i++) {
            const tipIndex = (score + i * 3) % tips.length;
            const li = document.createElement('li');
            li.innerHTML = `<svg class="tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>${tips[tipIndex]}</span>`;
            recommendationsList.appendChild(li);
        }
    }

    function hideRecommendations() {
        const recommendationsPanel = document.getElementById('recommendationsPanel');
        if(recommendationsPanel) {
            recommendationsPanel.classList.add('hidden');
        }
    }
});
