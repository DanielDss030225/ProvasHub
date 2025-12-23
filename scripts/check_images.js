
const fs = require('fs');
const path = require('path');

function getDimensions(filePath) {
    const buffer = fs.readFileSync(filePath);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    // Width is at offset 16, Height at 20 (4 bytes each, big endian)
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        const width = buffer.readInt32BE(16);
        const height = buffer.readInt32BE(20);
        return { width, height };
    }
    return null;
}

const files = [
    'app/icon.png',
    'public/favicon.png',
    'public/icone.png'
];

files.forEach(f => {
    const fullPath = path.resolve('c:/xampp/htdocs/provashub/provashub', f);
    if (fs.existsSync(fullPath)) {
        console.log(`${f}:`, getDimensions(fullPath));
    } else {
        console.log(`${f}: Not found`);
    }
});
