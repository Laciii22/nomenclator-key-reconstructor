import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="bg-blue-700 border-t border-blue-800 text-white py-3 text-center">
            <div className="max-w-screen-xl mx-auto px-4 flex items-center justify-center gap-4 text-xs text-blue-200">
                <span>© {new Date().getFullYear()} HCPortal — Nomenclator Key Reconstructor</span>
            </div>
        </footer>
    );
};

export default Footer;
