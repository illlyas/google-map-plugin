'use client';

import {Box} from "@mui/system";
import {
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Divider,
    ListItemAvatar, Avatar, IconButton, Alert, Snackbar
} from "@mui/material";
import LocationOnIcon from '@mui/icons-material/LocationOn';
import {useSearchParams} from "next/navigation";
import {useEffect, useRef, useState} from "react";

import MyLocationIcon from '@mui/icons-material/MyLocation';
import {Loader} from "@googlemaps/js-api-loader";
import {util} from "zod";
import find = util.find;

interface IPos {
    lat: number,
    lng: number
}
export default function Home() {
    const params = useSearchParams();
    const radius = parseInt(params.get('radius') as string, 10) || 0;
    const apiKey = params.get('apiKey') as string;
    const onFail = (msg: string) => {
        window?.parent?.postMessage({
            action: 'fail'
        }, '*');
        setErrMsg(msg);
        setErrOpen(true);
    }
    const onReject = (error: any) => {
        console.log(error)
        window?.parent?.postMessage({
            action: 'reject'
        }, '*');
        setErrMsg(JSON.stringify(error));
        setErrOpen(true);
    }

    const mapRef = useRef<HTMLDivElement>(null);
    const [records, setRecords] = useState<Record<string, any>[]>([]);
    const [activePlaceId, setActivePlaceId] = useState('');
    const [errOpen, setErrOpen] = useState(false);
    const [errMsg, setErrMsg] = useState('Location drifted out of fine-tuning range, please adjust')
    const geocoder = useRef<any>();
    const gMap = useRef<any>();
    const marker = useRef<any>();
    const circle = useRef<any>();
    const isOutDistance = useRef<boolean>(false);
    const pos = useRef<IPos>({
        lat: 0,
        lng: 0
    });
    const currentLocation = useRef<IPos>({
        lat: 0,
        lng: 0
    })
    const loadGoogleMap = () => {
        const loader = new Loader({
            apiKey,
            version: "weekly",
        });
        return loader.load();
    }
    const getGeoLocation = (success: () => void) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    pos.current = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    success();
                }, (error) => {
                    onReject(error)
                }, {
                    enableHighAccuracy: true // 高精度匹配获取
                });
        } else {
            onFail('The current browser environment does not support network positioning')
        }
    }

    const initGoogleMapLayer = () => {
        const map = new window.google.maps.Map(mapRef.current, {
            center: pos.current,
            zoom: 14,
            mapTypeId: "OSM",
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: false
        });

        map.mapTypes.set("OSM", new window.google.maps.ImageMapType({
            getTileUrl: (coord: any, zoom: number) => {
                return "https://tile.openstreetmap.org/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
            },
            tileSize: new window.google.maps.Size(256, 256),
            name: "OpenStreetMap",
            maxZoom: 18
        }));
        return map;
    }
    const initGeoCoder = () => new window.google.maps.Geocoder();
    const addCircle = () => {
        if (!radius) {
            return;
        }
        return new window.google.maps.Circle({
            fillColor: '#2f7debb8', // 圆形填充颜色
            fillOpacity: '0.7',
            strokeColor: '#EDEFF3', // 描边颜色
            strokeWeight: 2, // 描边宽度
            map: gMap.current,
            center: pos.current,
            radius,
        });
    }
    const addMarker = (position: IPos) => {
        const marker = new window.google.maps.Marker({
            position,
            map: gMap.current,
            draggable: !!radius
        });
        marker.addListener('dragend', (e: any) => {
            const nextPos = {
                lat: e.latLng.lat(),
                lng: e.latLng.lng()
            }
            formatGeoCoder(nextPos);
            handleLocationChange(nextPos)
        });
        return marker;
    }


    const formatGeoCoder = (latlng: IPos) => {
        geocoder.current.geocode({location: latlng})
            .then((response: any) => {
                const results = response.results;
                if (!results) {
                    return;
                }
                setRecords(results);
                if (results[0]) {
                    setActivePlaceId(results[0].place_id);
                }
            })
            .catch((e: string) => onFail(e))
    }
    const handleItemClick = (record: Record<string, any>) => {
        if (record.place_id === activePlaceId) {
            return;
        }
        if (!radius) {
            return;
        }
        if (marker.current) {
            marker.current.setMap(null);
            const nextPos = {
                lat: record.geometry.location.lat(),
                lng: record.geometry.location.lng()
            }
            marker.current = addMarker(nextPos);
            setActivePlaceId(record.place_id);
            handleLocationChange(nextPos);
        }
    }
    const handleResetLocation = () => {
        getGeoLocation(() => {
            gMap.current.setZoom(14);
            gMap.current.setCenter(pos.current);
            circle.current.setMap(null);
            circle.current = addCircle();
            marker.current.setMap(null);
            marker.current = addMarker(pos.current);
            formatGeoCoder(pos.current);
            handleLocationChange(pos.current);
        })
    }
    const handleLocationChange = (nextPos: IPos) => {
        const latLngA = new window.google.maps.LatLng(pos.current.lat, pos.current.lng);
        const latLngB = new window.google.maps.LatLng(nextPos.lat, nextPos.lng)
        const distance = window.google.maps.geometry.spherical.computeDistanceBetween(latLngA, latLngB);
        isOutDistance.current = distance >= radius;
        currentLocation.current = nextPos;
        if (isOutDistance.current && radius) {
            setErrOpen(true);
            setErrMsg('Location drifted out of fine-tuning range, please adjust')
        }
        window?.parent?.postMessage({
            action: 'onChange',
            data: {
                latLng: currentLocation.current,
                record: find(records, (record) => record.place_id === activePlaceId),
                isOutDistance: isOutDistance.current
            }
        }, '*')
    }
    useEffect(() => {
        if(!apiKey){
            onFail('No API Key')
            return;
        }
        getGeoLocation(() => {
            loadGoogleMap().then(() => {
                gMap.current = initGoogleMapLayer();
                geocoder.current = initGeoCoder();
                circle.current = addCircle();
                marker.current = addMarker(pos.current);
                formatGeoCoder(pos.current);
                setTimeout(() => {
                    handleLocationChange(pos.current);
                }, 300)
            })
        })
    }, []);
    return (<Box sx={{
        display: 'flex',
        height: '100%',
        flexDirection: 'column'
    }}>
        <Box sx={{
            flex: 1,
            position: 'relative'
        }}>
            <Box ref={mapRef} sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%'
            }}/>
            <Box sx={{
                position: 'absolute',
                top: 15,
                right: 15
            }}>
                <IconButton onClick={handleResetLocation}>
                    <MyLocationIcon color="primary"/>
                </IconButton>
            </Box>
        </Box>
        <Box sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            borderTop: '1px solid #ccc'
        }}>
            <List sx={{width: '100%', bgcolor: 'background.paper'}}>
                {records.map((record) => {
                    return (
                        <Box key={record.place_id}>
                            <ListItem
                                disablePadding
                                onClick={() => {
                                    handleItemClick(record)
                                }}
                            >
                                <ListItemButton>
                                    <ListItemAvatar sx={{
                                        visibility: record.place_id === activePlaceId ? 'visible' : 'hidden'
                                    }}>
                                        <Avatar>
                                            <LocationOnIcon/>
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText primary={record.formatted_address}
                                                  secondary={record.address_components.map((item:any) => {
                                                      return item.long_name
                                                  }).join('-')}/>
                                </ListItemButton>
                            </ListItem>
                            <Divider variant="inset"/>
                        </Box>
                    );
                })}
            </List>
        </Box>
        <Snackbar anchorOrigin={{
            vertical: 'top',
            horizontal: 'center'
        }}
                  onClose={() => {
                      setErrOpen(false);
                  }}
                  open={errOpen}
                  autoHideDuration={3000}
        >
            <Alert severity="error">
                {errMsg}
            </Alert>
        </Snackbar>
    </Box>)
}
