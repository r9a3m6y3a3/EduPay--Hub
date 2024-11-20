const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const stripe = require("stripe")("sk_test_51Q5rOjBNU1hIYlxRDLzMzsDcLYn0swRz1ve5TRjlkSgop7EU29bZhwRq7LdDFoC4z89BwOee5hXd25N9igza7CXO006Pfsj1Is");
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const port = 3030;
const app = express();

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Setup session middleware
app.use(session({
    secret: 'dQXaayz9Rl', // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
}));

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/students')
    .then(() => {
        console.log("MongoDB connection successful");
    })
    .catch(err => {
        console.error("MongoDB connection error:", err);
    });

// Define Schemas
const userSchema = new mongoose.Schema({
    name: String,
    app_no: String,
    email: String,
    department: String,
    batch: String,
    graduate: String,
    quota: String,
    accommodation: String,
    hostelname: String,
    hosteltype: String,
    scholarship: String,
    password: String,
    term1Status: { type: String, default: 'Unpaid' },
    term2Status: { type: String, default: 'Unpaid' },
    term3Status: { type: String, default: 'Unpaid' },
});

const Users = mongoose.model("Users", userSchema);

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
    amount: Number,
    tuition_fee: Number,
    record_fee: Number,
    term: String,
    status: { type: String, default: "Pending" },
    createdAt: { type: Date, default: Date.now }
});
const Payment = mongoose.model('Payment', paymentSchema);

// Helper Functions
function generateTemporaryPassword() {
    return Math.random().toString(36).slice(-8);
}

function calculateFees(user) {
    let term1Fee = 0;
    let term2Fee = 0;
    let term3Fee = 0;

    if (user.accommodation === "Hostel") {
        if (user.quota === "GQ" && user.graduate === "NFG" && user.scholarship === "None") {
            term1Fee = 33500;
            term2Fee = 23000;
            term3Fee = 23000;
        } else if (user.quota === "MQ" && user.graduate === "NFG" && user.scholarship === "Cut off concession") {
            term1Fee = 38500;
            term2Fee = 28000;
            term3Fee = 28000;
        } else if (user.scholarship === "PMSS" || user.scholarship === "7.5 Reservation") {
            term1Fee = 2000;
            term2Fee = 0;
            term3Fee = 0;
        } else {
            term1Fee = 43500;
            term2Fee = 33000;
            term3Fee = 33000;
        }
    } else {
        // Handle case for Day Scholars
        term1Fee = 9500;
        term2Fee = 9000;
        term3Fee = 9000;
    }

    return { term1Fee, term2Fee, term3Fee }; // Correctly structured return statement
}

// Routes for different pages
app.get('/', (req, res) => {
    res.redirect('/common.html'); // Redirect to common.html
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html')); // Route to login.html
});

app.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, 'form.html')); // Route to form.html
});

// Serve the dashboard HTML file
app.get('/dash', (req, res) => {
    res.sendFile(path.join(__dirname, 'dash.html'));
});

// Admin Routes
app.get('/dashadmin', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashadmin.html'));
});
// Add student
app.get('/admin/add-student', (req, res) => {
    res.sendFile(path.join(__dirname, 'add-student.html'));
});

// Add student-list
app.get('/admin/student-list', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-student-list.html'));
});

// Profile management
app.get('/studentDetails', (req, res) => {
    res.sendFile(path.join(__dirname, 'studentDetails.html'));
});
app.get('/payment.html', (req, res) => {
    res.sendFile(path.join(__dirname,'public', 'payment.html'));
});

// Handle user registration
app.post('/register', async (req, res) => {
    const { name, app_no, email, department, batch, graduate, quota, accommodation, hostelname, hosteltype, scholarship, password } = req.body;
    const user = new Users({
        name,
        app_no,
        email,
        department,
        batch,
        graduate,
        quota,
        accommodation,
        hostelname,
        hosteltype,
        scholarship,
        password
    });
    try {
        await user.save();
        res.redirect('/success.html');  // Redirect to success page
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving user data");
    }
});

// Handle user login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await Users.findOne({ email, password });
        if (user) {
            req.session.userId = user._id; // Save user ID in session
            res.redirect('/dash'); // Redirect to the dashboard
        } else {
            res.send("Email or password is incorrect");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// Admin API Routes
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const defaultUsername = 'admin';
    const defaultPassword = 'admin123';

    try {
        if (username === defaultUsername && password === defaultPassword) {
            req.session.isAdmin = true;
            res.json({ message: 'Admin login successful', redirectTo: '/dashadmin' });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Define isAdmin middleware
function isAdmin(req, res, next) {
    if (req.session.isAdmin) {
        return next();
    } else {
        return res.status(403).json({ message: "Access denied: Admins only" });
    }
}

// Admin Routes to Add Student
app.post('/api/admin/add-student', async (req, res) => {
    const studentData = req.body;

    try {
        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const user = new Users({
            ...studentData,
            password: hashedPassword,
            registeredBy: 'admin'
        });

        const { term1Fee, term2Fee, term3Fee } = calculateFees(user);
        user.term1Amount = term1Fee;
        user.term2Amount = term2Fee;
        user.term3Amount = term3Fee;

        await user.save();

        res.status(201).json({
            message: "Student added successfully",
            temporaryPassword: temporaryPassword
        });
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ message: "Error adding student" });
    }
});

// Get the list of all students
app.get('/api/students', async (req, res) => {
    try {
        const students = await Users.find(); // Fetch all students from the database
        res.status(200).json(students); // Send the students as a JSON response
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ message: "Error fetching students" });
    }
});

// Count Students API
app.get('/api/students/count', async (req, res) => {
    try {
        const totalStudents = await Users.countDocuments(); // Count total number of students
        res.json({ totalStudents });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student count' });
    }
});

// Admin Dashboard Stats API
app.get('/api/admin/dashboard-stats', isAdmin, async (req, res) => {
    try {
        const totalStudents = await Users.countDocuments(); // Fetch total number of students
        const paidStudents = await Users.countDocuments({ term1Status: 'Paid' }); // Count of students who have paid Term 1
        const unpaidStudents = await Users.countDocuments({ term1Status: 'Unpaid' }); // Count of students who have not paid Term 1
        
        res.json({ totalStudents, paidStudents, unpaidStudents });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Handle student viewing by ID
app.get('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid student ID' });
    }
    try {
        const student = await Users.findById(id);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json(student); // Send the student details as a JSON response
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ message: 'Error fetching student details' });
    }
});

// Delete student
app.delete('/api/students/:id', async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid student ID' });
    }

    try {
        const deletedStudent = await Users.findByIdAndDelete(id);
        if (!deletedStudent) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ message: 'Error deleting student' });
    }
});

// Handle Profile Management
app.get('/profile-management', async (req, res) => {
    if (!req.session.userId) {
        return res.status(403).send("Unauthorized access");
    }
    
    try {
        const user = await Users.findById(req.session.userId);
        if (!user) {
            return res.status(404).send("User  not found");
        }

        res.send(`
            <html>
                <head>
                    <title>Profile Management</title>
                    <link rel="stylesheet" type="text/css" href="styles.css">
                </head>
                <body>
                    <div class="container">
                        <h1>Profile Management</h1>
                        <h2>Name: ${user.name}</h2>
                        <p>Application Number: ${user.app_no}</p>
                        <p>Email: ${user.email}</p>
                        <p>Department: ${user.department}</p>
                        <p>Batch: ${user.batch}</p>
                        <p>Graduate Status: ${user.graduate}</p>
                        <p>Quota: ${user.quota}</p>
                        <p>Accommodation: ${user.accommodation}</p>
                        <p>Hostel Name: ${user.hostelname}</p>
                        <p>Hostel Type: ${user.hosteltype}</p>
                        <p>Scholarship: ${user.scholarship}</p>
                        <a href="/dash">Go back to Dashboard</a>
                    </div>
                </body>
            </html>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// Handle logout 
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "Error logging out" });
        }
        res.json({ message: "Logout successful" });
    });
});

// Handle fee calculation and display 
app.get('/feeDetails', async (req, res) => { 
    if (!req.session.userId) {
        return res.status(403).send("Unauthorized access");
    }

    try {
        const user = await Users.findById(req.session.userId);
        if (!user) {
            return res.status(404).send("Student not found");
        }
        
        // Fee Calculation Logic
        let admissionFeesTerm1 = 0;
        let tuitionFeesTerm1 = 0;
        let otherFees = 5000; // Fixed other fees
        let term1Fee, term2Fee, term3Fee;

        // Conditions based on accommodation, quota, and concession
        if (user.accommodation === "Hostel" || user.accommodation === "DayScholar") {
            if (user.quota.trim() === "GQ" && user.graduate.trim() === "NFG" && user.scholarship.trim() === "None") {
                admissionFeesTerm1 = 9500;
                tuitionFeesTerm1 = 19000;
                term1Fee = admissionFeesTerm1 + tuitionFeesTerm1 + otherFees; // Total for Term 1
                term2Fee = 0 + 18000 + otherFees; // Total for Term 2
                term3Fee = 0 + 18000 + otherFees; // Total for Term 3
            } else if (user.quota === "MQ" && user.graduate === "NFG" && user.scholarship === "Cut off concession") {
                admissionFeesTerm1 = 9500;
                tuitionFeesTerm1 = 24000;
                term1Fee = admissionFeesTerm1 + tuitionFeesTerm1 + otherFees; // Total for Term 1
                term2Fee = 0 + 23000 + otherFees; // Total for Term 2
                term3Fee = 0 + 23000 + otherFees; // Total for Term 3
            } else if ((user.quota === "GQ" || user.quota === "MQ") && (user.graduate === "NFG" || user.graduate === "FG") && (user.scholarship === "PMSS")) {
                admissionFeesTerm1 = 2000;
                term1Fee = admissionFeesTerm1 + 0 + 0; // Total for Term 1
                term2Fee = 0 + 0 + 0; // Total for Term 2
                term3Fee = 0 + 0 + 0; // Total for Term 3
            } else {
                admissionFeesTerm1 = 9500;
                tuitionFeesTerm1 = 29000;
                term1Fee = admissionFeesTerm1 + tuitionFeesTerm1 + otherFees; // Total for Term 1
                term2Fee = 0 + 28000 + otherFees; // Total for Term 2
                term3Fee = 0 + 28000 + otherFees; // Total for Term 3
            }
        } else {
            // Handle case for students not being day scholars or hostelers
            admissionFeesTerm1 = 9500;
            tuitionFeesTerm1 = 9500;
            term1Fee = admissionFeesTerm1 + tuitionFeesTerm1 + otherFees; // Total for Term 1
            term2Fee = 0 + 9000 + otherFees; // Total for Term 2
            term3Fee = 0 + 9000 + otherFees; // Total for Term 3
        }

        // Set payment statuses (assuming Term 1 is paid, others are unpaid)
        let term1Status = user.term1Status || "Unpaid";
        let term2Status = user.term2Status || "Unpaid";
        let term3Status = user.term3Status || "Unpaid";

        // Retrieve         // Retrieve payment records from the Payment collection
        const payments = await Payment.find({ userId: user._id });

        payments.forEach(payment => {
            if (payment.term === "Term 1" && payment.status === "Completed") {
                term1Status = "Paid";
            }
            if (payment.term === "Term 2" && payment.status === "Completed") {
                term2Status = "Paid";
            }
            if (payment.term === "Term 3" && payment.status === "Completed") {
                term3Status = "Paid";
            }
        });

        let totalUnpaid = 0;
        if (term2Status === "Unpaid") totalUnpaid += term2Fee;
        if (term3Status === "Unpaid") totalUnpaid += term3Fee;

        // Calculate total fees after defining term fees
        let totalFees = term1Fee + term2Fee + term3Fee;

        // If the request is JSON
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(200).json({
                user: user,
                feeDetails: {
                    term1Fee, term2Fee, term3Fee,
                    term1Status, term2Status, term3Status,
                    totalFees, totalUnpaid
                }
            });
        }

        // If the request is for HTML
        res.send(`
            <html>
            <head>
                <title>Fee Details</title>
                <script src="https://js.stripe.com/v3/"></script>
                <style>
                    body {
                        background: linear-gradient(to bottom right, #6a11cb, #2575fc);
                        font-family: Arial, sans-serif;
                        color: #fff;
                    }
                    table {
                        width: 50%;
                        margin: 20px auto;
                        border-collapse: collapse;
                        background-color: #fff;
                        color: #000;
                    }
                    th, td {
                        border: 1px solid black;
                        padding: 10px;
                        text-align: center;
                    }
                    h1, h2 {
                        text-align: center;
                    }
                    button {
                        display: block;
                        margin: 20px auto;
                        padding: 10px 20px;
                        font-size: 16px;
                    }
                </style>
            </head>
            <body>
                <h1>Fee Details for ${user.name}</h1>
                <table>
                    <tr>
                        <th>Term</th>
                        <th>Admission Fees</th>
                        <th>Tuition Fee</th>
                        <th>Other Fees</th>
                        <th>Total Fee</th>
                    </tr>
                    <tr>
                        <td>Term 1</td>
                        <td>${admissionFeesTerm1}</td>
                        <td>${tuitionFeesTerm1}</td>
                        <td>${otherFees}</td>
                        <td>${term1Fee}</td>
                    </tr>
                    <tr>
                        <td>Term 2</td>
                        <td>0</td>
                        <td>${term2Fee - otherFees}</td>
                        <td>${otherFees}</td>
                        <td>${term2Fee}</td>
                    </tr>
                    <tr>
                        <td>Term 3</td>
                        <td>0</td>
                        <td>${term3Fee - otherFees}</td>
                        <td>${otherFees}</td>
                        <td>${term3Fee}</td>
                    </tr>
                </table>
                <h2>Status of Each Term</h2>
                <table>
                    <tr>
                        <th>Term</th>
                        <th>Status</th>
                        <th>Fees</th>
                    </tr>
                    <tr>
                        <td>Term 1</td>
                        <td>${term1Status}</td>
                        <td>${term1Fee}</td>
                    </tr>
                    <tr>
                        <td>Term 2</td>
                        <td>${term2Status}</td>
                        <td>${term2Fee}</td>
                    </tr>
                    <tr>
                        <td>Term 3</td>
                        <td>${term3Status}</td>
                        <td>${term3Fee}</td>
                    </tr>
                </table>
                <h2>Total Fee for Unpaid Terms: ${totalUnpaid}</h2>
                <div>
                    <button id="pay-now" data-amount="${totalUnpaid}">Pay Now</button>
                </div>
                <script>
                                document.getElementById('pay-now').addEventListener('click', function() {
                    const amount = this.getAttribute('data-amount');
                    // Redirect to payment.html with amount as a query parameter
                    window.location.href = '/payment.html?amount=' + amount;
                });
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Serve the payment page
app.get('/payment.html', (req, res) => {
    const amount = req.query.amount;
    res.send(`
        <html>
        <head>
            <title>Payment</title>
            <script src="https://js.stripe.com/v3/"></script>
        </head>
        <body>
            <h1>Payment Page</h1>
            <h2>Amount: ₹${(amount / 100).toFixed(2)}</h2>
            <button id="checkout-button">Pay Now</button>
            <script>
                const stripe = Stripe("pk_test_51Q5rOjBNU1hIYlxRKmpa8noqUXkyqEvJIzY8fYRGx1NOjBowgDOSv2kRuKxEtaGHNbBEbRJeR78OZyJNas7XtKMD00JqtLRq4g"); // Replace with your actual publishable key
                document.getElementById('checkout-button').addEventListener('click', () => {
                    fetch('/create-checkout-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ amount: ₹${amount} }) // Ensure amount is being sent
                    })
                    .then(response => response.json())
                    .then(data => {
                        return stripe.redirectToCheckout({ sessionId: data.id });
                    })
                    .then(result => {
                        if (result.error) {
                            alert(result.error.message);
                        }
                    })
                    .catch(error => console.error("Error:", error));
                });
            </script>
        </body>
        </html>
    `);
});

// Stripe checkout session creation endpoint
app.post('/create-checkout-session', async (req, res) => {
    const { amount, metadata } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: `Term ₹${metadata.term} Fees` }, // Corrected string interpolation
                    unit_amount: amount,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}/receipt?session_id={CHECKOUT_SESSION_ID}`, // Corrected string interpolation
            cancel_url: `${req.headers.origin}/payment.html?amount=${amount}`, // Corrected string interpolation
            metadata: {
                tuition_fee: metadata.tuition_fee,
                record_fee: metadata.record_fee,
                term: metadata.term
            }
        });

        const paymentRecord = new Payment({
            userId: req.session.userId,
            amount: amount,
            tuition_fee: metadata.tuition_fee,
            record_fee: metadata.record_fee,
            term: metadata.term,
            status: "Pending"
        });
        await paymentRecord.save();

        res.json({ id: session.id });
    } catch (error) {
        console.error('Error creating Stripe session:', error);
        res.status(500).send("Error processing payment");
    }
});

// Successful payment image
app.get("/success", async (req, res) => {
    if (!req.session.userId) {
        return res.status(403).send("Unauthorized access");
    }

    const { term } = req.query; // For example, ?term=II in the query

    try {
        const user = await Users.findById(req.session.userId);
        if (!user) {
            return res.status(404).send("User  not found");
        }

        await Payment.updateOne(
            { userId: req.session.userId, term, status: "Pending" },
            { status: "Completed" }
        );

        if (term === "I") user.term1Status = "Paid";
        else if (term === "II") user.term2Status = "Paid";
        else if (term === "III") user.term3Status = "Paid";
        
        await user.save();

        res.send("Payment successful! Your term status has been updated.");
    } catch (err) {
        console.error("Error processing payment:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Generate and show receipt after payment
app.get('/receipt', async (req, res) => {
    const session_id = req.query.session_id;

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customer = session.customer_details;

        const user = await Users.findById(req.session.userId);
        if (!user) {
            return res.status(404).send("User not found");
        }

        // Create the receipt HTML
        const receiptHtml = `
            <html>
            <head>
                <title>Payment Receipt</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: #f7f7f7;
                        padding: 20px;
                    }
                    .receipt-container {
max-width: 700px;
                        margin: auto;
                        padding: 20px;
                        background: white;
                        border: 1px solid #ccc;
                    }
                    h1 {
                        text-align: center;
                        font-size: 1.5em;
                        margin-bottom: 20px;
                    }
                    h2 {
                        text-align: center;
                        font-size: 1.2em;
                        margin-bottom: 20px;
                    }
                    table {
                        width: 100%;
                        margin: 20px 0;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 10px;
                        border: 1px solid #ddd;
                    }
                    .logo {
                        text-align: center;
                        margin-bottom: 10px;
                    }
                    .header {
display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 5px;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 1.5em;
                    }
                    .signature {
                        margin-top: 30px;
                        text-align: right;
                        font-weight: bold;
                    }
                    .total {
                        font-size: 1.2em;
                        font-weight: bold;
                    }
                    .amount {
                        text-align: right;
                    }
                    .words {
                        font-style: italic;
                        margin-top: 20px;
                    }
                    .back-button {
display: block;
                        margin: 20px auto;
                        padding: 10px 20px;
                        font-size: 1em;
                        background-color: #4CAF50;
                        color: white;
                        border: none;
                        cursor: pointer;
                        text-align: center;
                    }
                    .back-button:hover {
                        background-color: #45a049;
                    }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    <div class="header">
                        <div class="logo">
                            <img src="logoimage.jpg" alt="Vivekanandha College of Engineering for Women" style="width: 150px;">
                        </div>
 <h1>Vivekanandha College of Engineering for Women (Autonomous)</h1>
                    </div>
                    <h2>Fees Receipt</h2>
                    <table>
                        <tr>
                            <th>Application No:</th>
                            <td>${user.app_no}</td>
                            <th>Academic Year:</th>
                            <td>2023-2024</td>
                        </tr>
                        <tr>
                            <th>Student Name:</th>
                            <td>${user.name}</td>
                            <th>Receipt Date:</th>
                            <td><span id="dateTime"></span></td>
                        </tr>
                        <tr>
                            <th>Department:</th>
                            <td>${user.department}</td>
                            <th>Batch:</th>
                            <td>${user.batch}</td>
                        </tr>
                    </table>
                    <table>
                        <tr>
                            <th>Particulars</th>
                            <th>Amount</th>
                        </tr>
                        <tr>
                            <td>Tuition Fee</td>
                            <td class="amount">$${session.metadata.tuition_fee || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td>Record & Other Fees</td>
                            <td class="amount">$${session.metadata.record_fee || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td><b>Total</b></td>
                            <td class="amount"><b>$${session.amount_total / 100}</b></td>
                        </tr>
                    </table>
                    <p class="words">(Amount in words: Forty Three Thousand Only)</p>
                    <p>We have received your payment for Term ${session.metadata.term} fees. Please keep this receipt for your records.</p>
                    <div class="signature">
                        <p>Authorised Signatory</p>
                    </div>
                    <button onclick="downloadReceipt()">Download Receipt</button>
                    <button class="back-button" onclick="goBack()">Back to Dashboard</button>
                </div>
 <script>
                    document.addEventListener("DOMContentLoaded", function() {
                        const dateTime = new Date().toLocaleString();
                        document.getElementById("dateTime").innerText = dateTime;
                    });

                    function downloadReceipt() {
                        const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = 'receipt.html';
                        link.click();
                    }

                    function goBack() {
                        window.location.href = 'dash.html'; // Redirect to dash.html
                    }
                </script>
            </body>
            </html>
        `;

// Send the receipt HTML as a response
res.send(receiptHtml);

} catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).send("Error generating receipt");
}
});
app.get('/api/payment-history', async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.status(401).send("User not authenticated");

        // Populate name and app_no from Users collection
        const payments = await Payment.find({ userId })
            .populate({ path: 'userId', select: 'name app_no' })
            .select('createdAt amount');

        // Format the response to include user data
        const formattedPayments = payments.map(payment => ({
            name: payment.userId.name,
            app_no: payment.userId.app_no,
            date: payment.createdAt,
            amount: payment.amount
        }));

        res.json(formattedPayments);
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).send("Error retrieving payment history");
    }
});
app.post('/updateFeeDetails', async (req, res) => {
    const { app_no, term1Status, term2Status, term3Status } = req.body;
    
    try {
        const student = await User.findOneAndUpdate(
            { app_no }, 
            { term1Status, term2Status, term3Status },
            { new: true }
        );

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json(student);
    } catch (error) {
        console.error('Error updating fee details:', error);
        res.status(500).send('Error updating fee details');
    }
});
async function updateFeeDetails(app_no, term1Status, term2Status, term3Status) {
    try {
        const response = await fetch('/updateFeeDetails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                app_no,
                term1Status,
                term2Status,
                term3Status
            })
        });

        const data = await response.json();
        console.log('Updated student:', data);
    } catch (error) {
        console.error('Error updating fee details:', error);
    }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});