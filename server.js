const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'finerva-secret-key-2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// In-memory database
const db = {
  users: [],
  portfolio: [],
  progress: []
};

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ============ WEB3 AUTH ROUTES ============

// Web3 Login
app.post('/api/web3-login', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;
    
    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ error: 'Wallet address, signature, and message required' });
    }

    // Find user by wallet address
    const user = db.users.find(u => u.wallet_address === walletAddress.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: 'No account found with this wallet. Please register first.' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Web3 Register
app.post('/api/web3-register', async (req, res) => {
  try {
    const { walletAddress, name } = req.body;
    
    if (!walletAddress || !name) {
      return res.status(400).json({ error: 'Wallet address and name required' });
    }

    // Check if wallet already registered
    const existingUser = db.users.find(u => u.wallet_address === walletAddress.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: 'Wallet already registered' });
    }

    // Create user with wallet
    const user = {
      id: db.users.length + 1,
      name,
      email: `${walletAddress.substring(2, 10)}@wallet.eth`,
      wallet_address: walletAddress.toLowerCase(),
      password: null,
      created_at: new Date().toISOString()
    };
    db.users.push(user);

    // Generate token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ AUTH ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      id: db.users.length + 1,
      name,
      email,
      password: hashedPassword,
      created_at: new Date().toISOString()
    };
    db.users.push(user);

    // Generate token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, name: user.name, email: user.email } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = db.users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ 
      success: true, 
      token, 
      user: { id: user.id, name: user.name, email: user.email } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ PORTFOLIO ROUTES ============

// Get portfolio
app.get('/api/portfolio', authenticateToken, (req, res) => {
  try {
    const portfolio = db.portfolio.filter(p => p.user_id === req.user.id);

    // Calculate totals
    let totalInvested = 0;
    let totalCurrent = 0;

    portfolio.forEach(item => {
      totalInvested += item.quantity * item.buy_price;
      totalCurrent += item.quantity * (item.current_price || item.buy_price);
    });

    const totalPL = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

    res.json({
      portfolio,
      summary: {
        totalInvested: totalInvested.toFixed(2),
        totalCurrent: totalCurrent.toFixed(2),
        totalPL: totalPL.toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add to portfolio
app.post('/api/portfolio', authenticateToken, (req, res) => {
  try {
    const { symbol, quantity, buyPrice } = req.body;
    
    if (!symbol || !quantity || !buyPrice) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const item = {
      id: db.portfolio.length + 1,
      user_id: req.user.id,
      symbol: symbol.toUpperCase(),
      quantity,
      buy_price: buyPrice,
      current_price: buyPrice,
      created_at: new Date().toISOString()
    };
    db.portfolio.push(item);

    res.json({ success: true, id: item.id });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete from portfolio
app.delete('/api/portfolio/:id', authenticateToken, (req, res) => {
  try {
    const index = db.portfolio.findIndex(p => p.id === parseInt(req.params.id) && p.user_id === req.user.id);
    if (index > -1) {
      db.portfolio.splice(index, 1);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ STOCK ROUTES ============

// Get stock data (simulated for demo)
app.get('/api/stocks/:symbol', authenticateToken, (req, res) => {
  try {
    const { symbol } = req.params;
    const basePrice = 100 + Math.random() * 200;
    const change = (Math.random() * 10 - 4).toFixed(2);
    const isPositive = parseFloat(change) >= 0;
    const finalPrice = basePrice * (1 + parseFloat(change) / 100);

    res.json({
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase() + ' Inc.',
      price: finalPrice.toFixed(2),
      change: change,
      isPositive,
      high: (finalPrice * 1.02).toFixed(2),
      low: (finalPrice * 0.98).toFixed(2),
      volume: Math.floor(Math.random() * 50000000).toLocaleString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ NEWS ROUTES ============

// Get news
app.get('/api/news', (req, res) => {
  try {
    const categories = ['Stocks', 'Crypto', 'Commodities', 'Economy'];
    const companies = ['NVIDIA', 'Tesla', 'Bitcoin', 'Apple', 'Gold', 'Microsoft', 'Amazon', 'Google'];
    const actions = [
      'surges after earnings report',
      'faces regulatory pressure',
      'breaks resistance level',
      'announces global expansion',
      'market volatility increases',
      'investor demand spikes',
      'releases quarterly results',
      'announces new partnership'
    ];

    const news = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      category: categories[Math.floor(Math.random() * categories.length)],
      title: companies[Math.floor(Math.random() * companies.length)] + ' ' + actions[Math.floor(Math.random() * actions.length)],
      description: 'Real-time financial intelligence detected strong market movement. Analysts are closely watching developments.',
      timestamp: new Date().toISOString()
    }));

    res.json(news);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ PROGRESS ROUTES ============

// Get learning progress
app.get('/api/progress', authenticateToken, (req, res) => {
  try {
    const progress = db.progress.filter(p => p.user_id === req.user.id);
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save learning progress
app.post('/api/progress', authenticateToken, (req, res) => {
  try {
    const { topicIndex, moduleIndex, completed } = req.body;

    // Check if exists
    const existingIndex = db.progress.findIndex(
      p => p.user_id === req.user.id && p.topic_index === topicIndex && p.module_index === moduleIndex
    );

    if (existingIndex > -1) {
      db.progress[existingIndex] = {
        ...db.progress[existingIndex],
        completed: completed ? 1 : 0,
        completed_at: completed ? new Date().toISOString() : null
      };
    } else {
      db.progress.push({
        id: db.progress.length + 1,
        user_id: req.user.id,
        topic_index: topicIndex,
        module_index: moduleIndex,
        completed: completed ? 1 : 0,
        completed_at: completed ? new Date().toISOString() : null
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ SERVE FRONTEND ============

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing page.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'learningmodule.html'));
});

app.get('/stock-predictor', (req, res) => {
  res.sendFile(path.join(__dirname, 'STOCKPREDICTOR.html'));
});

app.get('/news', (req, res) => {
  res.sendFile(path.join(__dirname, 'newsintellligence.html'));
});

app.get('/portfolio', (req, res) => {
  res.sendFile(path.join(__dirname, 'portfolio analyser.html'));
});

app.get('/ai-advisor', (req, res) => {
  res.sendFile(path.join(__dirname, 'ai advisor.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Finerva server running on http://localhost:${PORT}`);
  console.log('API Endpoints:');
  console.log('  POST /api/web3-login - Web3 wallet login');
  console.log('  POST /api/web3-register - Web3 wallet registration');
  console.log('  POST /api/register - Register new user');
  console.log('  POST /api/login - Login user');
  console.log('  GET  /api/portfolio - Get user portfolio');
  console.log('  POST /api/portfolio - Add to portfolio');
  console.log('  DELETE /api/portfolio/:id - Delete from portfolio');
  console.log('  GET  /api/stocks/:symbol - Get stock data');
  console.log('  GET  /api/news - Get news');
  console.log('  GET  /api/progress - Get learning progress');
  console.log('  POST /api/progress - Save learning progress');
});
