Long term design:

When the Linux computer boots, it boots in ramfs mode. Here we set up a BT PAN based on 192.168.0.1 as the main host.
192.68.0.2-9 as secondary hosts, and 192.168.0.10 and up as clients (vaults). A DHCP server will assign IP numbers to
the clients. A Nostr relay is activated in boot upmode, a X509 certificate is enabled. A QR Code is present that contains
all the relevant information. The relay runs on localhost port 666.

The QR code is scanned by the app in the phone, and a PAN Connection is established. A Message is sent to the desktop
with the decrypted key, encrypted in a NIP 44 message.

The computer boots, the phone reconnects, and it now sees that the phone is in operation mode, the phone populates
the nostr relay with NIP01 entries for the different services that are provided. This includes nostr, ssh, and openpgp.

They all have a service profile including:

* The protocol that is supported, as a P tag.
* The identity that is supported (bod@wonderland.inc)
* The content has all the other relevant info.

More key vaults that connect to the PAN can advertise there services here.

Step by step in using the service with the plugin.

The plugin is installed in the browser, when the users press "login" in the window a popup appears that presents the
user with the relevant nostr profiles. This is done in two steps, step 1. you parse all the service offers on port 666.
You then use the public relays configures to download the public profile of the users, there by presenting a list of
options. Then user then select the appropriate profile, and a nip 46 connection is set up with a bunker link. When the
user connects via the NIP 46 connection to the vault, the owner of the phone is prompted for an access request, a
fingerprint is used to authorize the connection. Once the connection is authorized the binding is saved in the local
profile. The connection is the set as permanent in the profile.







