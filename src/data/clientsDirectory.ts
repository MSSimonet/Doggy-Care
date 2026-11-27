// Directorio de ejemplo: nombres, teléfonos (555-xxxx) y direcciones inventados
export interface ClientProfile {
  id: string;
  dogName: string;
  breed?: string;
  birthYear?: number;
  ownerName: string;
  ownerLastName?: string;
  relatives?: string;
  contact?: string;
  address?: string;
  historicalStay?: {
    arrivalDate: string;
    departureDate: string;
    days: number;
    subDiario?: string;
    transporte?: string;
    realXD?: string;
    finalDT?: string;
  };
}

export const clientsDirectory: ClientProfile[] = [
  {
    "id": "client-1",
    "dogName": "Candela",
    "breed": "Caniche",
    "ownerName": "Sofía",
    "ownerLastName": "Romero",
    "relatives": "Pablo - 555-0211",
    "contact": "555-0201",
    "address": "Calle Ficticia 101",
    "historicalStay": {
      "arrivalDate": "2025-03-10",
      "departureDate": "2025-03-17",
      "days": 8,
      "subDiario": "21000"
    }
  },
  {
    "id": "client-2",
    "dogName": "Bóxer",
    "breed": "Bichón frisé",
    "ownerName": "Ezequiel",
    "ownerLastName": "Ferreyra",
    "relatives": "Ana - 555-0222",
    "contact": "555-0202",
    "address": "Calle Ficticia 201"
  },
  {
    "id": "client-3",
    "dogName": "Luna",
    "breed": "Yorkshire terrier",
    "ownerName": "Florencia",
    "ownerLastName": "Gómez",
    "relatives": "",
    "contact": "555-0203",
    "address": "Calle Ficticia 301",
    "historicalStay": {
      "arrivalDate": "2025-06-01",
      "departureDate": "2025-06-08",
      "days": 8,
      "subDiario": "24000"
    }
  }
];
