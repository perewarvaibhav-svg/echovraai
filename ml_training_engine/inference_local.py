import sys
import json
import torch
import librosa
from transformers import BertTokenizer
# Import architecture from training script
try:
    from train_hybrid_emotion import HybridEmotionEngine
except ImportError:
    print(json.dumps({"error": "Model architecture not found"}))
    sys.exit(1)

def run_local_inference(wav_path):
    device = torch.device('cpu')  # Force CPU for local execution without CUDA
    
    # 1. Load Architecture
    model = HybridEmotionEngine(num_classes=7).to(device)
    
    # 2. Load Your Custom Trained Weights (The brain!)
    try:
        model.load_state_dict(torch.load("emotion_fusion_v1.pt", map_location=device))
        model.eval() # Set to inference mode
    except FileNotFoundError:
        print(json.dumps({"error": "emotion_fusion_v1.pt not found. You must run the training script first!"}))
        sys.exit(1)

    # 3. Audio Extraction
    try:
        waveform, _ = librosa.load(wav_path, sr=16000)
    except Exception as e:
        print(json.dumps({"error": f"Corrupt audio file: {e}"}))
        sys.exit(1)

    # 4. Semantic Extraction (using basic tokenizer since Whisper is async in JS)
    tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
    # Use generic text for absolute acoustic dependence if transcript unavailable
    encoding = tokenizer(
        "User is speaking.", 
        truncation=True, 
        padding='max_length', 
        max_length=128, 
        return_tensors='pt'
    )
    
    # Run the Math
    with torch.no_grad():
        w_tensor = torch.tensor(waveform, dtype=torch.float32).unsqueeze(0).to(device)
        input_ids = encoding['input_ids'].to(device)
        attn_mask = encoding['attention_mask'].to(device)
        
        logits = model(w_tensor, input_ids, attn_mask)
        probabilities = torch.nn.functional.softmax(logits, dim=1)[0]
    
    # Map back to classes (matching rav_map)
    classes = ["Happy", "Sad", "Angry", "Neutral", "Fear", "Disgust", "Surprise"]
    
    # Build tensor JSON
    tensors = []
    for i, p in enumerate(probabilities.tolist()):
        tensors.append({"label": classes[i], "score": p})
    
    tensors = sorted(tensors, key=lambda x: x['score'], reverse=True)
    
    result = {
        "emotion": tensors[0]['label'],
        "confidence": round(tensors[0]['score'] * 100, 2),
        "tensor": tensors[:4]
    }
    
    print(json.dumps(result))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Provide audio path"}))
        sys.exit(1)
    
    # Hide transformers warning logs
    import logging
    logging.getLogger("transformers").setLevel(logging.ERROR)
    
    run_local_inference(sys.argv[1])
