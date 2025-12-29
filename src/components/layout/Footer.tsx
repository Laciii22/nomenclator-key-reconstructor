import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="bg-blue-600 text-white py-4 text-center">
            <div className="max-w-screen-xl mx-auto px-4">
                <p className="m-0 text-sm">© {new Date().getFullYear()} Nomenclator Key Reconstructor</p>
            </div>
        </footer>
    );
};

export default Footer;
