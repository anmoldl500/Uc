const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');

const app = express();
app.use(cors());

let qrCodeData = null;
let isConnected = false;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    }
});

client.on('qr', (qr) => {
    qrCodeData = qr;
    console.log('नया QR जनरेट हुआ, अब Pairing Code माँगा जा सकता है!');
});

client.on('ready', () => {
    isConnected = true;
    qrCodeData = null;
    console.log('WhatsApp कनेक्ट हो गया!');
});

client.on('disconnected', () => {
    isConnected = false;
    console.log('WhatsApp डिसकनेक्ट हो गया!');
});

client.initialize();

// नया सिस्टम: Pairing Code निकालने के लिए
app.get('/api/get-code', async (req, res) => {
    const phone = req.query.phone;
    
    if (!phone) {
        return res.json({ error: 'नंबर नहीं मिला। लिंक के अंत में अपना नंबर डालें (जैसे: ?phone=918954891112)' });
    }
    
    try {
        const code = await client.requestPairingCode(phone);
        res.json({ success: true, pairingCode: code });
    } catch (error) {
        res.json({ error: 'कोड निकालने में दिक्कत आई। सुनिश्चित करें कि सर्वर रेडी है।' });
    }
});

// पुराने सिस्टम
app.get('/api/status', (req, res) => {
    if (isConnected) return res.json({ status: 'connected' });
    if (qrCodeData) return res.json({ status: 'qr_ready', qr: qrCodeData });
    res.json({ status: 'starting' });
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
