import torch
import torch.nn as nn
from transformers import Wav2Vec2Model, BertModel
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset
import librosa
import os

# ==============================================================================
# HYBRID MULTI-MODAL EMOTION ENGINE (PyTorch)
# ==============================================================================
class HybridEmotionEngine(nn.Module):
    def __init__(self, num_classes=7):
        super().__init__()
        # 1. Acoustic Embeddings
        self.wav2vec = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base")
        # 2. Semantic Embeddings 
        self.bert = BertModel.from_pretrained("bert-base-uncased")
        
        # 3. Fusion & Classification Head
        self.fusion = nn.Linear(768 + 768, 512)
        self.classifier = nn.Sequential(
            nn.ReLU(),
            nn.Dropout(0.4), # Prevent overfitting on small datasets
            nn.Linear(512, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Linear(128, num_classes)
        )
        
    def forward(self, input_waveform, input_ids, attention_mask):
        # Audio Pool
        audio_out = self.wav2vec(input_waveform).last_hidden_state
        audio_pooled = torch.mean(audio_out, dim=1) 
        
        # Text Pool
        text_out = self.bert(input_ids=input_ids, attention_mask=attention_mask).pooler_output
        
        # Fusion
        fused = torch.cat((audio_pooled, text_out), dim=1)
        fused_state = self.fusion(fused)
        return self.classifier(fused_state)

# ==============================================================================
# DATASET LOADER (CREMA-D / RAVDESS)
# ==============================================================================
class EmotionDataset(Dataset):
    def __init__(self, audio_paths, texts, labels, tokenizer):
        self.audio_paths = audio_paths
        self.labels = labels
        self.texts = texts
        self.tokenizer = tokenizer
        
    def __len__(self):
        return len(self.audio_paths)
        
    def __getitem__(self, idx):
        # Load and resample audio to 16kHz
        import numpy as np
        waveform, _ = librosa.load(self.audio_paths[idx], sr=16000)
        
        # Pad or Truncate to exactly 4 seconds (16000 * 4 = 64000 samples)
        max_len = 64000
        if len(waveform) > max_len:
            waveform = waveform[:max_len]
        else:
            waveform = np.pad(waveform, (0, max_len - len(waveform)), mode='constant')
        
        # Tokenize Whisper Transcript
        encoding = self.tokenizer(
            self.texts[idx], 
            truncation=True, 
            padding='max_length', 
            max_length=128, 
            return_tensors='pt'
        )
        
        return {
            'waveform': torch.tensor(waveform, dtype=torch.float32),
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'label': torch.tensor(self.labels[idx], dtype=torch.long)
        }

# ==============================================================================
# TRAINING LOOP
# ==============================================================================
def train_model():
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Executing Training Pipeline on: {device}")

    # Initialize Engine
    model = HybridEmotionEngine(num_classes=7).to(device)
    optimizer = AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)
    criterion = nn.CrossEntropyLoss()

    # ── RAVDESS Dataset Parser ──
    audio_paths, labels, texts = [], [], []
    base_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_dir = os.path.join(base_dir, "archive")

    # Map RAVDESS codes to our 7 classes: Happy(0), Sad(1), Angry(2), Neutral(3), Fear(4), Disgust(5), Surprise(6)
    rav_map = {"01": 3, "02": 3, "03": 0, "04": 1, "05": 2, "06": 4, "07": 5, "08": 6}

    if os.path.exists(dataset_dir):
        for root, _, files in os.walk(dataset_dir):
            for file in files:
                if file.endswith(".wav"):
                    parts = file.split("-")
                    if len(parts) == 7: # Strict RAVDESS naming convention format
                        emo_code = parts[2]
                        if emo_code in rav_map:
                            audio_paths.append(os.path.join(root, file))
                            labels.append(rav_map[emo_code])
                            # RAVDESS actors only speak two exact sentences
                            stmt = int(parts[4])
                            texts.append("Kids are talking by the door" if stmt == 1 else "Dogs are sitting by the door")

    print(f"✅ Discovered {len(audio_paths)} RAVDESS audio files in the 'archive' folder.")
    if len(audio_paths) == 0:
        print("⚠️ Waiting for .wav files to be placed in the archive folder...")
        return

    from transformers import BertTokenizer
    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    dataset = EmotionDataset(audio_paths, texts, labels, tokenizer)
    
    # Num workers=0 for Windows compatibility
    dataloader = DataLoader(dataset, batch_size=8, shuffle=True, num_workers=0)

    epochs = 15
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        
        for batch in dataloader:
            optimizer.zero_grad()
            
            waveforms = batch['waveform'].to(device)
            input_ids = batch['input_ids'].to(device)
            attn_mask = batch['attention_mask'].to(device)
            labels = batch['label'].to(device)
            
            # Forward Pass
            outputs = model(waveforms, input_ids, attn_mask)
            loss = criterion(outputs, labels)
            
            # Application of Gradients
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            total_loss += loss.item()
            
        print(f"Epoch {epoch+1}/{epochs} | Loss: {total_loss:.4f}")
        
    # Save the Neural Network Weights
    torch.save(model.state_dict(), "emotion_fusion_v1.pt")
    print("Training Complete. Model securely flushed to generic tensor payload.")

if __name__ == "__main__":
    print("WARNING: Initializing Hybrid Deep Learning Model...")
    print("This will heavily utilize your system memory.")
    train_model() 
