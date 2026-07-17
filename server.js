const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');

const app = express();
app.use(cors());

let statusMsg = 'starting';
let myPairingCode = null;
let isConnected = false;

// अपना नंबर यहाँ फिक्स रखें
const MY_PHONE_NUMBER = '917500673337'; 

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        // यह सेटिंग्स RAM बचाने और क्रैश रोकने के लिए हैं
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ] 
    }
});

client.on('qr', async (qr) => {
    statusMsg = 'qr_ready';
    console.log('नया QR जनरेट हुआ!');
    
    try {
        const code = await client.requestPairingCode(MY_PHONE_NUMBER);
        myPairingCode = code;
        console.log('आपका Pairing Code है:', code);
    } catch(err) {
        console.log('कोड निकालने में एरर:', err.message);
    }
});

client.on('ready', () => {
    isConnected = true;
    myPairingCode = null;
    statusMsg = 'connected';
    console.log('WhatsApp कनेक्ट हो गया!');
});

client.on('disconnected', () => {
    isConnected = false;
    statusMsg = 'disconnected';
    console.log('WhatsApp डिसकनेक्ट हो गया!');
});

client.initialize();

app.get('/api/status', (req, res) => {
    if (isConnected) {
        return res.json({ status: 'connected', message: 'WhatsApp सफलतापूर्वक जुड़ गया है!' });
    }
    if (myPairingCode) {
        return res.json({ status: 'pairing_code_ready', code: myPairingCode });
    }
    res.json({ status: statusMsg });
});

app.get('/api/get-groups', async (req, res) => {
    if (!isConnected) return res.status(400).json({ error: 'WhatsApp कनेक्ट नहीं है!' });
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        
        let groupData = groups.map(group => {
            return {
                groupName: group.name,
                totalMembers: group.participants.length,
                members: group.participants.map(p => p.id.user)
            };
        });
        res.json({ success: true, totalGroups: groupData.length, groups: groupData });
    } catch (error) {
        res.status(500).json({ error: 'डेटा निकालने में दिक्कत आई' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`सर्वर पोर्ट ${PORT} पर चालू है!`));
