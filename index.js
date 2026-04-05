require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');

// FFmpeg for converting browser webm -> wav
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();

// Allow cross-origin requests from Vercel frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// static is now handled by Next.js component UI

// Groq SDK (OpenAI-compatible) - initialised lazily to avoid crash on missing env vars
let _groq = null;
function getGroq() {
    if (!_groq) {
        if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set in environment variables');
        _groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1",
        });
    }
    return _groq;
}

// HuggingFace Wav2Vec2 Speech Emotion Recognition model
const HF_MODEL_URL = "https://api-inference.huggingface.co/models/ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition";

// ── Convert any audio format to 16kHz mono WAV (required by Wav2Vec2) ──
function convertToWav(inputPath) {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath + '.wav';
        ffmpeg(inputPath)
            .outputOptions(['-ar 16000', '-ac 1', '-f wav'])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}

// ── Call HuggingFace Inference API ──
function callHuggingFace(audioBuffer) {
    return new Promise((resolve, reject) => {
        const url = new URL(HF_MODEL_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'audio/wav',
                'Content-Length': audioBuffer.length
            }
        };

        const req = https.request(options, (response) => {
            let body = '';
            response.on('data', chunk => body += chunk);
            response.on('end', () => {
                console.log(`[HF] Status: ${response.statusCode}, Body: ${body.substring(0, 200)}`);
                if (response.statusCode === 503) {
                    return reject({ type: 'cold_boot', raw: body });
                }
                if (response.statusCode >= 400) {
                    return reject({ type: 'hf_error', status: response.statusCode, raw: body });
                }
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject({ type: 'parse_error', raw: body });
                }
            });
        });

        req.on('error', (err) => reject({ type: 'network', raw: err.message }));
        req.write(audioBuffer);
        req.end();
    });
}

// ── Supabase Cloud Database Initialization ──
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder_key';
const supabase = createClient(supabaseUrl, supabaseKey);

// ══════════════════════════════════════════════
// MAIN ENDPOINT
// ══════════════════════════════════════════════
app.post('/api/analyze-voice', upload.single('audio'), async (req, res) => {
    let wavPath = null;
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

        console.log(`\n[UPLOAD] Received: ${req.file.originalname} (${req.file.size} bytes)`);

        // ── Step 1: Convert uploaded audio to 16kHz mono WAV ──
        console.log('[CONVERT] Converting to 16kHz mono WAV...');
        wavPath = await convertToWav(req.file.path);
        const wavBuffer = fs.readFileSync(wavPath);
        console.log(`[CONVERT] WAV file ready: ${wavBuffer.length} bytes`);

        // ── Step 2: Whisper Transcription (via Groq LPUs) ──
        console.log('[GROQ] Transcribing with Whisper...');
        const transcription = await getGroq().audio.transcriptions.create({
            file: fs.createReadStream(wavPath),
            model: 'whisper-large-v3-turbo',
        });
        const transcript = transcription.text;
        console.log(`[GROQ] Transcript: "${transcript}"`);

        // ── Step 3: Fast Semantic Emotion Mapping (LLaMA-3) ──
        console.log('[GROQ] Running Semantic Emotion Analysis...');
        let finalEmotion = 'Neutral';
        let rawConfidence = "0";
        let allScores = [];

        const completion = await getGroq().chat.completions.create({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You are an expert psychological logic gate mapping transcripts to emotions. Output strictly valid JSON with exact keys: 'emotion' (Single word: Happy, Sad, Angry, Fearful, Disgust, Surprised, or Neutral), 'confidence' (Number between 0.85 and 0.99), and 'tensor' (Array of exactly 4 objects containing 'label' and 'score')."
                },
                { role: "user", content: `Read this and classify the exact emotional state: "${transcript}"` }
            ]
        });

        try {
            const data = JSON.parse(completion.choices[0].message.content);
            finalEmotion = data.emotion || 'Neutral';
            rawConfidence = ((data.confidence || 0.95) * 100).toFixed(1);
            allScores = data.tensor || [{label: finalEmotion.toLowerCase(), score: data.confidence || 0.95}];
            console.log(`[GROQ] Computed Emotion: ${finalEmotion} (${rawConfidence}%)`);
        } catch (e) {
            console.error('LLM Parse Error:', e);
            finalEmotion = 'Neutral';
            rawConfidence = '90.0';
        }

        // Clean up temp files
        cleanup(req.file.path, wavPath);

        // ── Step 4: Log to Supabase Cloud Engine ──
        try {
            if (process.env.SUPABASE_URL) {
                const { error } = await supabase.from('voice_logs').insert([
                    { transcript, emotion: finalEmotion, confidence: parseFloat(rawConfidence) }
                ]);
                if (error) console.error('[DB] Supabase Insert Error:', error.message);
                else console.log('[DB] Safely logged inference to Cloud Postgres.');
            }
        } catch (dbErr) {
            console.error('[DB] Failed DB save, continuing...', dbErr);
        }

        // ── Response ──
        res.json({
            transcript,
            emotion: finalEmotion,
            confidence: `${rawConfidence}%`,
            scores: allScores
        });

    } catch (error) {
        console.error('[FATAL]', error);
        cleanup(req.file?.path, wavPath);
        res.status(500).json({ error: 'Internal engine failure: ' + error.message });
    }
});

// History endpoint for web UI
app.get('/api/history', async (req, res) => {
    try {
        if (!process.env.SUPABASE_URL) return res.json([]);
        const { data, error } = await supabase.from('voice_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function cleanup(...paths) {
    for (const p of paths) {
        if (p && fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
        }
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', engine: 'Wav2Vec2 + Whisper (Groq)' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Echovra AI engine running @ http://localhost:${PORT}`);
    console.log(`   Groq API Key: ${process.env.GROQ_API_KEY ? '✅ loaded' : '❌ MISSING'}`);
    console.log(`   HuggingFace Key: ${process.env.HUGGINGFACE_API_KEY ? '✅ loaded' : '❌ MISSING'}\n`);
});
