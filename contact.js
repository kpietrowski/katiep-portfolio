// Contact Form — Multi-step with Voice Input

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // Multi-step Contact Form
    // ==========================================
    const formSteps = document.querySelectorAll('.form-step');
    const continueButtons = document.querySelectorAll('.continue-btn:not(.submit-btn)');
    const backButtons = document.querySelectorAll('.back-btn');
    const submitBtn = document.getElementById('submit-btn');

    // Form data storage
    const formData = {
        name: '',
        email: '',
        message: ''
    };

    // Navigate to step
    const goToStep = (stepNumber) => {
        formSteps.forEach(step => {
            step.classList.remove('active');
            if (parseInt(step.dataset.step) === stepNumber) {
                step.classList.add('active');
            }
        });
    };

    // Continue buttons
    continueButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const nextStep = parseInt(btn.dataset.next);
            const currentStep = nextStep - 1;

            // Validate and save data
            if (currentStep === 1) {
                const nameInput = document.getElementById('user-name');
                if (!nameInput.value.trim()) {
                    nameInput.focus();
                    return;
                }
                formData.name = nameInput.value.trim();
            } else if (currentStep === 2) {
                const emailInput = document.getElementById('user-email');
                if (!emailInput.value.trim() || !emailInput.value.includes('@')) {
                    emailInput.focus();
                    return;
                }
                formData.email = emailInput.value.trim();
            }

            goToStep(nextStep);
        });
    });

    // Back buttons
    backButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const prevStep = parseInt(btn.dataset.prev);
            goToStep(prevStep);
        });
    });

    // Enter key to continue
    document.querySelectorAll('.input-wrapper input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const step = input.closest('.form-step');
                const continueBtn = step.querySelector('.continue-btn');
                if (continueBtn) continueBtn.click();
            }
        });
    });

    // ==========================================
    // Voice Recording (OpenAI Whisper)
    // ==========================================
    const micBtn = document.getElementById('mic-btn');
    const recordingIndicator = document.getElementById('recording-indicator');
    const typeInsteadBtn = document.getElementById('type-instead-btn');
    const textInputContainer = document.getElementById('text-input-container');
    const transcriptionPreview = document.getElementById('transcription-preview');
    const transcriptionText = document.getElementById('transcription-text');
    const editTranscriptionBtn = document.getElementById('edit-transcription-btn');
    const projectIdeaTextarea = document.getElementById('project-idea');

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    // Toggle type instead
    typeInsteadBtn.addEventListener('click', () => {
        textInputContainer.classList.remove('hidden');
        typeInsteadBtn.style.display = 'none';
        document.querySelector('.voice-input-container').style.display = 'none';
        transcriptionPreview.classList.add('hidden');
        projectIdeaTextarea.focus();
    });

    // Toggle back to voice
    const useVoiceBtn = document.getElementById('use-voice-btn');
    useVoiceBtn.addEventListener('click', () => {
        textInputContainer.classList.add('hidden');
        typeInsteadBtn.style.display = 'block';
        document.querySelector('.voice-input-container').style.display = 'block';
        projectIdeaTextarea.value = '';
    });

    // Edit transcription
    editTranscriptionBtn.addEventListener('click', () => {
        projectIdeaTextarea.value = transcriptionText.textContent;
        textInputContainer.classList.remove('hidden');
        transcriptionPreview.classList.add('hidden');
        typeInsteadBtn.style.display = 'none';
        document.querySelector('.voice-input-container').style.display = 'none';
        projectIdeaTextarea.focus();
    });

    // Microphone button
    micBtn.addEventListener('click', async () => {
        if (isRecording) {
            // Stop recording
            mediaRecorder.stop();
            isRecording = false;
            micBtn.classList.remove('recording');
            recordingIndicator.classList.remove('active');
        } else {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (e) => {
                    audioChunks.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    stream.getTracks().forEach(track => track.stop());

                    // Show loading state
                    micBtn.querySelector('.mic-label').textContent = 'Processing...';

                    // Send to Whisper API
                    await transcribeAudio(audioBlob);

                    micBtn.querySelector('.mic-label').textContent = 'Tap to speak';
                };

                mediaRecorder.start();
                isRecording = true;
                micBtn.classList.add('recording');
                recordingIndicator.classList.add('active');

            } catch (err) {
                console.error('Microphone access denied:', err);
                alert('Please allow microphone access to use voice input.');
            }
        }
    });

    // Transcribe audio with OpenAI Whisper
    async function transcribeAudio(audioBlob) {
        const WHISPER_API_ENDPOINT = '/api/transcribe';

        try {
            const formDataObj = new FormData();
            formDataObj.append('file', audioBlob, 'recording.webm');
            formDataObj.append('model', 'whisper-1');

            const response = await fetch(WHISPER_API_ENDPOINT, {
                method: 'POST',
                body: formDataObj
            });

            if (response.ok) {
                const data = await response.json();
                transcriptionText.textContent = data.text;
                transcriptionPreview.classList.remove('hidden');
                document.querySelector('.voice-input-container').style.display = 'none';
                typeInsteadBtn.style.display = 'none';
                formData.message = data.text;
            } else {
                throw new Error('Transcription failed');
            }
        } catch (err) {
            console.error('Transcription error:', err);
            // Fallback to text input
            alert('Voice transcription unavailable. Please type your message instead.');
            typeInsteadBtn.click();
        }
    }

    // Submit form
    submitBtn.addEventListener('click', async () => {
        // Get message from textarea or transcription
        if (!textInputContainer.classList.contains('hidden')) {
            formData.message = projectIdeaTextarea.value.trim();
        }

        if (!formData.message) {
            alert('Please share your project idea.');
            return;
        }

        // Show loading state
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                goToStep(4);
            } else {
                throw new Error('Submission failed');
            }
        } catch (error) {
            console.error('Submit error:', error);
            alert('Something went wrong. Please try again or email directly.');
            submitBtn.textContent = 'Send Message';
            submitBtn.disabled = false;
        }
    });
});
