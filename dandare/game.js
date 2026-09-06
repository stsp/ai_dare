// Dan Dare 1 - ZX Spectrum Web Version
// Uses the original map from https://maps.speccy.cz/maps/DanDare1.png

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants - ZX Spectrum resolution scaled
const GAME_WIDTH = 512;
const GAME_HEIGHT = 384;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// ZX Spectrum colors
const COLORS = {
    BLACK: '#000000',
    BLUE: '#0000D7',
    RED: '#D70000',
    MAGENTA: '#D700D7',
    GREEN: '#00D700',
    CYAN: '#00D7D7',
    YELLOW: '#D7D700',
    WHITE: '#FFFFFF'
};

// Game state
let gameState = 'start'; // start, playing, paused, gameover
let score = 0;
let lives = 3;
let level = 1;
let cameraX = 0;

// Input handling
const keys = {};

document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    
    if (e.code === 'KeyP' && gameState === 'playing') {
        gameState = 'paused';
        document.getElementById('pause-screen').classList.remove('hidden');
    } else if (e.code === 'KeyP' && gameState === 'paused') {
        gameState = 'playing';
        document.getElementById('pause-screen').classList.add('hidden');
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Load resources
const mapImage = new Image();
const spritesImage = new Image();

let mapLoaded = false;
let spritesLoaded = false;

mapImage.onload = () => {
    mapLoaded = true;
    console.log('Map loaded:', mapImage.width, 'x', mapImage.height);
};

spritesImage.onload = () => {
    spritesLoaded = true;
    console.log('Sprites loaded');
};

mapImage.src = 'dare1.png';
spritesImage.src = 'sprites.png';

// Player object
const player = {
    x: 50,
    y: GAME_HEIGHT / 2,
    width: 24,
    height: 16,
    speed: 5,
    color: COLORS.CYAN,
    bullets: [],
    lastShot: 0,
    shootDelay: 200
};

// Enemies
let enemies = [];
let enemyBullets = [];
let particles = [];

// Spawn enemy
function spawnEnemy(x, y, type = 0) {
    const types = [
        { color: COLORS.RED, width: 20, height: 16, health: 1, speed: 2, score: 100 },
        { color: COLORS.MAGENTA, width: 24, height: 20, health: 2, speed: 1.5, score: 200 },
        { color: COLORS.GREEN, width: 28, height: 24, health: 3, speed: 1, score: 300 }
    ];
    
    const t = types[type % types.length];
    enemies.push({
        x: x,
        y: y,
        ...t,
        vx: -t.speed,
        vy: Math.random() * 2 - 1,
        lastShot: 0,
        shootDelay: 1000 + Math.random() * 1000
    });
}

// Create explosion particles
function createExplosion(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 30 + Math.random() * 20,
            color: color,
            size: 2 + Math.random() * 3
        });
    }
}

// Collision detection
function checkCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

// Check collision with terrain from map
function checkTerrainCollision(x, y, width, height) {
    if (!mapLoaded) return false;
    
    const scaleX = mapImage.width / GAME_WIDTH;
    const scaleY = mapImage.height / GAME_HEIGHT;
    
    // Sample points around the object
    const samplePoints = [
        {x: x, y: y},
        {x: x + width, y: y},
        {x: x, y: y + height},
        {x: x + width, y: y + height},
        {x: x + width/2, y: y + height/2}
    ];
    
    for (const point of samplePoints) {
        const mapX = Math.floor((point.x + cameraX) * scaleX);
        const mapY = Math.floor(point.y * scaleY);
        
        if (mapX >= 0 && mapX < mapImage.width && mapY >= 0 && mapY < mapImage.height) {
            // Get pixel from map - if it's not black, it's terrain
            // We'll use a simpler approach: check if we're in bounds
            // For actual pixel checking, we'd need to draw to a temp canvas
        }
    }
    
    // Simple boundary check based on map height
    const mapAspectRatio = mapImage.height / mapImage.width;
    const maxScroll = mapImage.width - GAME_WIDTH;
    
    return false; // Allow free movement for now
}

// Update player
function updatePlayer() {
    // Movement
    if (keys['ArrowLeft'] || keys['KeyA']) {
        player.x = Math.max(0, player.x - player.speed);
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
        player.x = Math.min(GAME_WIDTH - player.width, player.x + player.speed);
    }
    if (keys['ArrowUp'] || keys['KeyW']) {
        player.y = Math.max(0, player.y - player.speed);
    }
    if (keys['ArrowDown'] || keys['KeyS']) {
        player.y = Math.min(GAME_HEIGHT - player.height, player.y + player.speed);
    }
    
    // Shooting
    if (keys['Space'] && Date.now() - player.lastShot > player.shootDelay) {
        player.bullets.push({
            x: player.x + player.width,
            y: player.y + player.height / 2 - 2,
            width: 12,
            height: 4,
            speed: 10,
            color: COLORS.YELLOW
        });
        player.lastShot = Date.now();
        playSound('shoot');
    }
    
    // Update bullets
    for (let i = player.bullets.length - 1; i >= 0; i--) {
        const bullet = player.bullets[i];
        bullet.x += bullet.speed;
        
        // Remove off-screen bullets
        if (bullet.x - cameraX > GAME_WIDTH) {
            player.bullets.splice(i, 1);
        }
    }
}

// Update enemies
function updateEnemies() {
    // Spawn new enemies
    if (Math.random() < 0.02 && enemies.length < 5 + level) {
        spawnEnemy(GAME_WIDTH + cameraX + 50, Math.random() * (GAME_HEIGHT - 30));
    }
    
    // Update existing enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        // Move enemy
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        
        // Bounce off top/bottom
        if (enemy.y <= 0 || enemy.y >= GAME_HEIGHT - enemy.height) {
            enemy.vy *= -1;
        }
        
        // Enemy shooting
        if (Date.now() - enemy.lastShot > enemy.shootDelay && enemy.x < cameraX + GAME_WIDTH) {
            enemyBullets.push({
                x: enemy.x,
                y: enemy.y + enemy.height / 2,
                width: 10,
                height: 4,
                speed: -6,
                color: COLORS.RED
            });
            enemy.lastShot = Date.now();
        }
        
        // Remove off-screen enemies
        if (enemy.x + enemy.width < cameraX) {
            enemies.splice(i, 1);
        }
    }
    
    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        bullet.x += bullet.speed;
        
        if (bullet.x + bullet.width < cameraX) {
            enemyBullets.splice(i, 1);
        }
    }
}

// Update particles
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.vx *= 0.95;
        p.vy *= 0.95;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// Check collisions
function checkCollisions() {
    // Player bullets vs enemies
    for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
        const bullet = player.bullets[bi];
        
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
            const enemy = enemies[ei];
            
            if (checkCollision(bullet, enemy)) {
                player.bullets.splice(bi, 1);
                enemy.health--;
                
                if (enemy.health <= 0) {
                    createExplosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.color);
                    score += enemy.score;
                    updateHUD();
                    playSound('explosion');
                    enemies.splice(ei, 1);
                } else {
                    playSound('hit');
                }
                break;
            }
        }
    }
    
    // Enemy bullets vs player
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        
        if (checkCollision(bullet, player)) {
            enemyBullets.splice(i, 1);
            playerHit();
        }
    }
    
    // Enemies vs player
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        
        if (checkCollision(enemy, player)) {
            createExplosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.color);
            enemies.splice(i, 1);
            playerHit();
        }
    }
}

// Player hit
function playerHit() {
    lives--;
    updateHUD();
    createExplosion(player.x + player.width/2, player.y + player.height/2, COLORS.CYAN, 20);
    playSound('hit');
    
    if (lives <= 0) {
        gameOver();
    } else {
        // Respawn invincibility could be added here
        player.x = 50;
        player.y = GAME_HEIGHT / 2;
    }
}

// Update HUD
function updateHUD() {
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
    document.getElementById('level').textContent = level;
}

// Level progression
function checkLevelProgress() {
    const levelThreshold = level * 1000;
    if (score >= levelThreshold) {
        level++;
        updateHUD();
        playSound('levelup');
        
        // Heal player slightly
        if (lives < 5) lives++;
    }
    
    // Scroll camera based on score/progress
    const targetCameraX = Math.min(score / 10, mapImage.width - GAME_WIDTH);
    cameraX += (targetCameraX - cameraX) * 0.02;
}

// Draw functions
function drawMap() {
    if (!mapLoaded) {
        ctx.fillStyle = COLORS.BLACK;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        return;
    }
    
    // Draw portion of map based on camera position
    ctx.drawImage(
        mapImage,
        cameraX, 0, GAME_WIDTH, mapImage.height,
        0, 0, GAME_WIDTH, GAME_HEIGHT
    );
}

function drawPlayer() {
    ctx.fillStyle = player.color;
    
    // Draw ship shape
    ctx.beginPath();
    ctx.moveTo(player.x + player.width, player.y + player.height/2);
    ctx.lineTo(player.x, player.y);
    ctx.lineTo(player.x + player.width * 0.3, player.y + player.height/2);
    ctx.lineTo(player.x, player.y + player.height);
    ctx.closePath();
    ctx.fill();
    
    // Engine glow
    ctx.fillStyle = COLORS.YELLOW;
    ctx.beginPath();
    ctx.arc(player.x, player.y + player.height/2, 4 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawEnemies() {
    enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        
        // Draw alien shape
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 
                Math.min(enemy.width, enemy.height)/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = COLORS.WHITE;
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width * 0.35, enemy.y + enemy.height * 0.4, 3, 0, Math.PI * 2);
        ctx.arc(enemy.x + enemy.width * 0.65, enemy.y + enemy.height * 0.4, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = COLORS.BLACK;
        ctx.beginPath();
        ctx.arc(enemy.x + enemy.width * 0.35, enemy.y + enemy.height * 0.4, 1.5, 0, Math.PI * 2);
        ctx.arc(enemy.x + enemy.width * 0.65, enemy.y + enemy.height * 0.4, 1.5, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawBullets() {
    player.bullets.forEach(bullet => {
        ctx.fillStyle = bullet.color;
        ctx.fillRect(bullet.x - cameraX, bullet.y, bullet.width, bullet.height);
    });
    
    enemyBullets.forEach(bullet => {
        ctx.fillStyle = bullet.color;
        ctx.fillRect(bullet.x - cameraX, bullet.y, bullet.width, bullet.height);
    });
}

function drawParticles() {
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 50;
        ctx.fillRect(p.x - cameraX, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;
}

// Main game loop
function gameLoop() {
    if (gameState === 'playing') {
        updatePlayer();
        updateEnemies();
        updateParticles();
        checkCollisions();
        checkLevelProgress();
    }
    
    // Clear and draw
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    
    drawMap();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawParticles();
    
    requestAnimationFrame(gameLoop);
}

// Sound system using Web Audio API
let audioContext = null;
let musicOscillators = [];
let isMusicPlaying = false;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch(type) {
        case 'shoot':
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
            break;
            
        case 'explosion':
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);
            gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
            break;
            
        case 'hit':
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
            oscillator.frequency.linearRampToValueAtTime(100, audioContext.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.15);
            break;
            
        case 'levelup':
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(554, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.2);
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.3);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            break;
    }
}

// Dan Dare theme melody (simplified)
const danDareTheme = [
    {note: 261, duration: 200},  // C4
    {note: 329, duration: 200},  // E4
    {note: 392, duration: 200},  // G4
    {note: 523, duration: 400},  // C5
    {note: 392, duration: 200},  // G4
    {note: 329, duration: 200},  // E4
    {note: 261, duration: 200},  // C4
    {note: 0, duration: 200},    // Rest
    {note: 349, duration: 200},  // F4
    {note: 415, duration: 200},  // G#4
    {note: 493, duration: 200},  // B4
    {note: 659, duration: 400},  // E5
    {note: 493, duration: 200},  // B4
    {note: 415, duration: 200},  // G#4
    {note: 349, duration: 200},  // F4
    {note: 0, duration: 200},    // Rest
];

let currentNoteIndex = 0;
let lastNoteTime = 0;

function playMusic() {
    if (!audioContext || !isMusicPlaying) return;
    
    const currentTime = audioContext.currentTime * 1000;
    
    if (currentTime - lastNoteTime > danDareTheme[currentNoteIndex].duration) {
        const note = danDareTheme[currentNoteIndex];
        
        if (note.note > 0) {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.type = 'square';
            osc.frequency.value = note.note;
            
            gain.gain.setValueAtTime(0.15, audioContext.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, audioContext.currentTime + note.duration / 1000);
            
            osc.start(audioContext.currentTime);
            osc.stop(audioContext.currentTime + note.duration / 1000);
        }
        
        currentNoteIndex = (currentNoteIndex + 1) % danDareTheme.length;
        lastNoteTime = currentTime;
    }
    
    if (isMusicPlaying) {
        requestAnimationFrame(playMusic);
    }
}

function startMusic() {
    if (isMusicPlaying) return;
    
    initAudio();
    isMusicPlaying = true;
    currentNoteIndex = 0;
    lastNoteTime = 0;
    playMusic();
}

function stopMusic() {
    isMusicPlaying = false;
}

// Game control functions
function startGame() {
    initAudio();
    gameState = 'playing';
    score = 0;
    lives = 3;
    level = 1;
    cameraX = 0;
    player.x = 50;
    player.y = GAME_HEIGHT / 2;
    player.bullets = [];
    enemies = [];
    enemyBullets = [];
    particles = [];
    
    updateHUD();
    
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    
    startMusic();
    gameLoop();
}

function gameOver() {
    gameState = 'gameover';
    stopMusic();
    document.getElementById('final-score').textContent = score;
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
}

function resumeGame() {
    gameState = 'playing';
    document.getElementById('pause-screen').classList.add('hidden');
    startMusic();
}

// Event listeners
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Initial draw
ctx.fillStyle = COLORS.BLACK;
ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

console.log('Dan Dare 1 - ZX Spectrum Web Version');
console.log('Map loaded from: https://maps.speccy.cz/maps/DanDare1.png');
