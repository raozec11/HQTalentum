const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function findFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(findFiles(fullPath));
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = findFiles(srcDir);

let modifiedCount = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Detect if we need to inject imports
    const hasAlert = content.includes('alert(');
    const hasConfirm = content.includes('window.confirm(');

    if (hasAlert || hasConfirm) {
        if (!content.includes('import { showSuccess, showError, showInfo, confirmAction }')) {
            const importStmt = `import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";\n`;
            // Add right after last import, or top
            const lastImportIndex = content.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
                const nlIndex = content.indexOf('\n', lastImportIndex);
                content = content.slice(0, nlIndex + 1) + importStmt + content.slice(nlIndex + 1);
            } else {
                content = importStmt + content;
            }
        }
    }

    // Replace window.confirm with await confirmAction
    // Example: if (!window.confirm("...")) -> if (!(await confirmAction("...")))
    // Works best if the function is async. We assume the surrounding function is async because these are mostly async react handlers.
    // Regex matches: window.confirm(`...`) or window.confirm("...")
    content = content.replace(/window\.confirm\(([^)]+)\)/g, '(await confirmAction($1))');

    // Replace alert("...") with showSuccess/showError based on text
    // Regex for alert("...")
    // Using a function replacer
    content = content.replace(/alert\(([^)]+)\)/g, (match, message) => {
        message = message.trim();
        // If it says "Failed", "Error", "already used", etc. we use showError
        if (message.match(/fail|error|already|need to|limit/i)) {
            return `showError(${message})`;
        } else if (message.match(/success|submitted|copied|updated/i)) {
            return `showSuccess(${message})`;
        } else {
            return `showInfo(${message})`;
        }
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        modifiedCount++;
        console.log("Updated:", file);
    }
});

console.log(`Updated ${modifiedCount} files.`);
