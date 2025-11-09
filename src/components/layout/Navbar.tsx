import React from "react";

const Navbar: React.FC = () => {
    return (
        <nav className="bg-blue-500 sticky top-0 z-50 shadow-md">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                <h1 className="text-white text-lg font-bold">
                    HCPortal Semi-Automatic Nomenclator Key Reconstruction module
                </h1>
                <div className="flex gap-4">
                    <a href="/" className="text-white hover:underline">Domov</a>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;