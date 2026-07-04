import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const getMockToken = (role = 'guest') => {
  return jwt.sign(
    { id: 1, email: 'admin@demo.com', name: 'Demo Data', role }, 
    process.env.JWT_SECRET || 'encho_default_secret', 
    { expiresIn: '24h' }
  );
};

const token = getMockToken('admin');
console.log(token);
