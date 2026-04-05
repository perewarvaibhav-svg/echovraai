# Voice Emotion Audio Datasets (Download Guide)

To train a robust Voice Emotion Detection model, you need high-quality datasets that contain a diverse array of actors, accents, and recording conditions. 

Below are the **Big Three** datasets used in industry-standard Emotion AI. You can download all of them completely for free.

---

### 1. RAVDESS (Ryerson Audio-Visual Database of Emotional Speech and Song)
**Best for**: Absolute baseline accuracy and extreme emotional clarity.
*   **Description**: 24 professional actors (12 male, 12 female) recorded in a noise-free studio environment. They speak two specific sentences with varying degrees of emotional intensity (normal/strong).
*   **Emotions**: Calm, Happy, Sad, Angry, Fearful, Surprise, Disgust.
*   **Download Link**: [Kaggle: RAVDESS Emotional Speech Audio](https://www.kaggle.com/datasets/uwrfkaggler/ravdess-emotional-speech-audio)
*   **Directory Format**: Files are named geometrically (e.g. `03-01-05-01-02-01-16.wav`). The **3rd number** in the filename indicates the emotion (01=Neutral, 02=Calm, 05=Angry, etc.)

---

### 2. CREMA-D (Crowd-sourced Emotional Multimodal Actors Dataset)
**Best for**: Removing bias and generalizing across race, age, and accents.
*   **Description**: 91 actors spanning ages 20 to 74 from diverse demographic backgrounds. This dataset is crucial for real-world robustness because it stops your model from memorizing the specific pitch of a few actors.
*   **Emotions**: Happy, Sad, Anger, Fear, Disgust, Neutral.
*   **Download Link**: [Kaggle: CREMA-D Dataset](https://www.kaggle.com/datasets/ejlok1/cremad)
*   **Directory Format**: Names end in acronyms like `..._HAP.wav` or `..._ANG.wav` for easy parsing.

---

### 3. TESS (Toronto Emotional Speech Set)
**Best for**: Highly articulated, clearly pronounced emotional speech.
*   **Description**: 2 actresses (one younger, one older) recorded 200 target words in a carrier phrase ("Say the word _"). Excellent for baseline testing, but highly susceptible to overfitting if used alone because it is very constrained.
*   **Emotions**: Angry, Disgust, Fear, Happy, Pleasant Surprise, Sad, Neutral.
*   **Download Link**: [Kaggle: TESS Dataset](https://www.kaggle.com/datasets/ejlok1/toronto-emotional-speech-set-tess)

---

## 🛠 Integrating them into Python
Once you download and extract these `.zip` files into standard folders, you will feed them into the `train_hybrid_emotion.py` script. 

**Pro-Tip for the Hackathon**: Make a script that walks through the directories, extracts the true label from the filename, and saves everything to a `dataset.csv` with two columns: `[file_path, emotion]`. Your PyTorch `DataLoader` can then effortlessly read from that CSV!
