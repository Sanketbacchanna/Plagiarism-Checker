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

    function performAIAnalysis(code) {
        // 1. Lines analysis
        const lines = code.split('\n').filter(l => l.trim().length > 0).length;
        if(linesCount) linesCount.textContent = `${lines}`;

        // Mock AI detection logic based on code properties
        // Generates a deterministic score based on code length, entropy, and comments
        
        // Count comments
        const commentLines = (code.match(/\/\*[\s\S]*?\*\/|\/\/.*|#.*/g) || []).length;
        const commentRatio = lines > 0 ? commentLines / lines : 0;
        
        // A simple hash function to make results consistent for the same code
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Use hash to generate a base AI probability (pseudo-random but deterministic)
        let baseScore = Math.abs(hash % 60) + 20; // 20% to 80%

        // Adjust based on some heuristics
        if (commentRatio > 0.2) {
            // High comment ratio often correlates with AI generated tutorial code
            baseScore += 15;
        }
        
        // Detect common AI boilerplate variables/patterns
        const aiKeywords = ['calculate', 'compute', 'result', 'temp', 'helper', 'foo', 'bar'];
        let aiPatternCount = 0;
        const lowerCode = code.toLowerCase();
        aiKeywords.forEach(kw => {
            if (lowerCode.includes(kw)) aiPatternCount++;
        });
        
        if(aiPatterns) aiPatterns.textContent = (aiPatternCount * 3 + Math.abs(hash % 10)); // Mock number
        
        // Structural Predictability (Mock)
        const predictScore = Math.min(99, Math.abs(hash % 40) + 40);
        if(predictability) predictability.textContent = `${predictScore}%`;
        
        // Final weighted score
        let finalScore = baseScore + (aiPatternCount * 2);
        
        // Cap at 99 and round
        finalScore = Math.min(99, Math.round(finalScore));
        if (lines < 5) finalScore = Math.abs(hash % 30); // Low score for very little code

        updateUI(finalScore);
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
