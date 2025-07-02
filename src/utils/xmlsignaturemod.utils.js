"use strict";
const { DOMParser } = require("@xmldom/xmldom");
const forge = require("node-forge");
const { SignedXml } = require("xml-crypto");

class XmlSignatureMod {
    /**
     * @param {Buffer} pfxBuffer - Buffer del archivo .pfx cargado en memoria
     * @param {string} password - Contraseña del .pfx
     * @param {string} xmlStringStructure - XML en string a firmar
     * @param {string} [signNodeName] - Nombre del nodo raíz a firmar (opcional, si no se envía se detecta)
     */
    constructor(pfxBuffer, password, xmlStringStructure, signNodeName) {
        if (!Buffer.isBuffer(pfxBuffer)) {
            throw new Error("El PFX debe proporcionarse como un Buffer en memoria.");
        }

        this.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
        this.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
        this.transforms = [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ];
        this.digestAlgorithm = 'http://www.w3.org/2001/04/xmlenc#sha256';

        this.pfxBuffer = pfxBuffer;
        this.password = password;
        this.xmlStringStructure = xmlStringStructure;

        // Detecta automáticamente el nodo raíz si no se pasó
        this.signXpath = signNodeName 
            ? `//*[local-name()='${signNodeName}']` 
            : this.detectSignNodeXpath();
    }

    /**
     * Detecta automáticamente el nombre del nodo raíz y retorna el XPath para firmar
     * @returns {string}
     */
    detectSignNodeXpath() {
        const domXML = new DOMParser().parseFromString(this.xmlStringStructure, "text/xml");
        const rootName = domXML.documentElement.nodeName;
        return `//*[local-name()='${rootName}']`;
    }

    setSignNodeName(nodeName) {
        this.signXpath = `//*[local-name()='${nodeName}']`;
    }

    verifyXMLStructure() {
        const domXML = new DOMParser().parseFromString(this.xmlStringStructure, "text/xml");
        const signatureNode = domXML.getElementsByTagName("ext:ExtensionContent");
        if (signatureNode.length === 0) {
            throw new Error('Error: el XML no contiene el nodo "ext:ExtensionContent" donde insertar la firma');
        }
        
        console.log('this.signXpath: ', this.signXpath);
        const signNodeName = this.signXpath.replace(/[/*\[\]@=']/g, '').split('local-name()=')[1].replace(/[()]/g, '');
        const signNode = domXML.getElementsByTagName(signNodeName);
        if (signNode.length === 0) {
            throw new Error(`Error: el XML no contiene el nodo raíz ${signNodeName}`);
        }
    }

    async getSignedXML() {
        this.verifyXMLStructure();
        const key = await this.convertPFXtoPEM();

        const sig = new SignedXml({
            privateKey: key.privateKey,
            signatureAlgorithm: this.signatureAlgorithm,
            canonicalizationAlgorithm: this.canonicalizationAlgorithm,
            publicCert: key.cert,
            getKeyInfoContent: () => {
                return `<ds:X509Data><ds:X509Certificate>${key.cert.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/(\r\n|\n|\r)/gm, "").trim()}</ds:X509Certificate></ds:X509Data>`;
            }
        });

        sig.addReference({
            xpath: this.signXpath,
            transforms: this.transforms,
            digestAlgorithm: this.digestAlgorithm,
            isEmptyUri: true
        });

        sig.computeSignature(this.xmlStringStructure, {
            attrs: { Id: 'SignatureSP' },
            location: { reference: "//*[local-name(.)='ExtensionContent']", action: "prepend" },
            prefix: "ds",
        });

        return sig.getSignedXml();
    }

    async convertPFXtoPEM() {
        const pfxAsn1 = forge.asn1.fromDer(this.pfxBuffer.toString('binary'));
        const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, this.password);

        const privateKeyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
        if (!privateKeyBags || privateKeyBags.length === 0) {
            throw new Error('Error: no se encontró una clave privada en el PFX');
        }

        const privateKeyBag = privateKeyBags[0];
        const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
        if (!certBags || certBags.length === 0) {
            throw new Error('Error: no se encontró un certificado en el PFX');
        }

        const certBag = certBags[0];
        const privateKeyPem = forge.pki.privateKeyToPem(privateKeyBag.key);
        const certPem = forge.pki.certificateToPem(certBag.cert);

        return {
            privateKey: privateKeyPem,
            cert: certPem
        };
    }
}

module.exports = { XmlSignatureMod };
