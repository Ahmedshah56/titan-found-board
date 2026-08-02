// --- FORCE ABSOLUTE PATH LOADING ---
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Added '../' to step out of the utils folder

require('dotenv').config(); 
const nodemailer = require('nodemailer');

const sendVerificationEmail = async (email, otp) => {
    // --- FIX: Create the transporter INSIDE the function to catch environment variables on time ---
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    // Debug tracking logs to prove it's capturing your variables live in terminal
    console.log("--- DYNAMIC MAIL ATTEMPT ---");
    console.log("Routing email through account:", process.env.EMAIL_USER || "MISSING CREDENTIALS!");
    console.log("----------------------------");

    const mailOptions = {
        from: `"TITAN Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'TITAN Campus Board - Verification Code',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; border: 1px solid #e5e7eb; padding: 25px; border-radius: 8px;">
                <h2 style="color: #0d1d2d; border-bottom: 2px solid #d6a04a; padding-bottom: 10px;">TITAN Campus Board</h2>
                <p>Hello Student,</p>
                <p>Your requested registration verification code is:</p>
                <div style="background-color: #f3f4f6; text-align: center; font-size: 28px; font-weight: bold; padding: 15px; margin: 20px 0; color: #0d1d2d; border-radius: 4px; border: 1px dashed #d6a04a;">
                    ${otp}
                </div>
                <p style="color: #6b7280; font-size: 12px;">This code is valid for 10 minutes.</p>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail };
