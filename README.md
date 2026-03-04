# Sawata Research Hub

Sawata Research Hub is the official institutional repository of Sawata National High School, dedicated to preserving, organizing, and providing accessible digital access to research outputs produced by our academic community.

## Features

- **Research Paper Management**: Upload, browse, and download research papers
- **Advanced Search & Filtering**: Filter by category, academic strand, and school year
- **User Authentication**: Secure login and registration system
- **Admin Panel**: Comprehensive admin dashboard for managing papers and users
- **Statistics Dashboard**: Track research engagement metrics
- **Cloud Storage**: Powered by Supabase for reliable data storage

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Supabase (Cloud Storage & Authentication)
- **Deployment**: Vercel

## Supabase Configuration

This project uses the following Supabase configuration (already embedded in the code):

- **URL**: `https://pmeryfzgjjvtwohhgxxu.supabase.co`
- **Storage Bucket**: `research-papers`
- **User Credentials Bucket**: `user-credentials`

Your existing Supabase setup will continue to work without any changes.

## Deployment to Vercel

### Prerequisites

- A GitHub account
- A Vercel account (sign up at vercel.com)

### Steps to Deploy

1. **Create a GitHub Repository**
   - Go to github.com and create a new repository
   - Name it something like `sawata-research-hub`

2. **Upload Files**
   - Clone the repository to your local machine
   - Copy all files from this folder to your repository
   - Commit and push to GitHub

3. **Import to Vercel**
   - Log in to vercel.com
   - Click "Add New..." → "Project"
   - Select your GitHub repository
   - Configure the settings:
     - Framework Preset: Other
     - Output Directory: `.` (current directory)
   - Click "Deploy"

4. **Your Site is Live!**
   - Vercel will provide you with a live URL
   - Your Supabase configuration will work automatically

## Project Structure

```
Vercel_ready/
├── index.html              # Main HTML file
├── assets/
│   ├── css/
│   │   └── styles.css     # Main stylesheet
│   ├── js/
│   │   ├── app.js         # Main application JavaScript
│   │   └── chart.min.js   # Chart.js library
│   └── images/
│       └── sawata-logo.png # School logo
├── vercel.json            # Vercel configuration
├── README.md              # This file
└── .gitignore            # Git ignore rules
```

## Usage

### For Students

1. Create an account by clicking "Sign Up"
2. Browse research papers using the search and filter options
3. Upload your own research papers
4. Track your uploads in "My Uploads"

### For Administrators

1. Login with admin credentials:
   - Email: `admin@sawata.edu.ph`
   - Password: `admin123`
2. Access the Admin Panel from the navigation
3. Manage users, papers, and system settings

## License

This project is developed by Grade 12 Russia Class, Science Education Track, Sawata National High School.

## Contact

- **Email**: snhs.research@davaodelnorte.edu.ph
- **Phone**: (084) 123-4567
- **Address**: Sawata National High School, San Isidro District, Division of Davao del Norte
