require('dotenv').config();
const express = require('express');
const app = express();
bodyParser = require('body-parser');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine','pug');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
var request = require("request");

//add pug
const pug = require('pug');
app.set('view engine','pug');

//apivideo
const apiVideoClient = require('@api.video/nodejs-client');
const apiVideoKey = process.env.apiProductionKey;
const client = new apiVideoClient({apiKey: apiVideoKey});


//we could use the API to grab the videos and their duration, but no need to replicated over and over
//just hardcoding for the demo
var videolist = ['vi6QvU9dhYCzW3BpPvPsZUa8','vi1DrBc0VkPfedcfTc21U1TP','vi47Q8KHXLYyaOoX2Yoznxqh'];
var videoDurations= [321,333,91];
// var videolist = ['vi47Q8KHXLYyaOoX2Yoznxqh','vi6QvU9dhYCzW3BpPvPsZUa8','vi1DrBc0VkPfedcfTc21U1TP'];

// var videoDurations= [91,321,333];


var timeWatched = [0,0,0];

app.get('/training', (req, res) => {
  //dont cache the page
  arrayIndex=2;
  res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  var userName = req.query.userName;

  

  var userName = req.query.userName;
  
  var findTheVideoToStart  = iterateVideos(videolist, videoDurations, userName, 0);
  findTheVideoToStart
    .then(function(unwatchedVideo){

      console.log("the first unwatched video is ", unwatchedVideo);

      //now we can build the page.
      return res.render('training', {videolist, unwatchedVideo, userName});
    });
 
});


function iterateVideos(videolist, videoDurations, userName, videoCounter){
  return new Promise(function(resolve, reject){
      //soo take list of videos, and iterate until we know which video can be watched.
      console.log("testing video "+videoCounter);
      var videowatched  = videoWatched(videolist[videoCounter], videoDurations[videoCounter], userName);
      videowatched
      .then(function(passfail){
    
        console.log("video "+videoCounter+ " "+ passfail);
        if(passfail){
          //video was watched, so lets check the next one
          videoCounter++;
          if (videoCounter < videolist.length){
            var nextVideo = iterateVideos(videolist, videoDurations, userName, videoCounter);
            resolve(nextVideo);
          }else{
            //the last video was watched so, stop and show all the videos...
            resolve(videoCounter -1);
          }
        }else{
          //video was NOT watched start wit this video
          console.log("resolve the counter of the first video not watched", videoCounter);
          resolve(videoCounter);
        }
      }).catch((error) =>{
        reject(error);
    });



  });


}

function  videoWatched(videoId, videoDuration, userName, videoCounter){
  return new Promise(function(resolve, reject) {
      var enoughOfVideoWatched = false;
      currentPage = '1';
      pageSize = '25';
      var metadata = {'classUserName': userName};
      var params = { videoId, metadata, currentPage, pageSize};
      console.log("params",params);
      const result = client.rawStatistics.listVideoSessions(params);
      result.then(function(videos) {
        
        var sessionList = videos.data;
        console.log("Number of sessions to test " , sessionList.length);
        if(sessionList.length == 0){
          //there are no sessions
          console.log("no sessions");
          resolve(false);
        }else{
          //we have sessions - lets see if any of them have been watched 100%
          var maxWatched =0;
          counter =0;
          for(i=0;i<sessionList.length;i++){
            //get each session ID, and figure out how long each session watched the video
            var sessionId = sessionList[i].session.sessionId;
            pageSize = '100';
            console.log(sessionId);
            var sessionParams = {sessionId, currentPage, pageSize};
            //get the data from each session
            ///TODO getsessiondata
            var summedUpTime =  sessionTimeWatched(sessionParams, videoDuration);
            summedUpTime.then(function(results)  {
              
              console.log(sessionId);
              console.log("time watched on session "+ sessionId, results);
              console.log("videoDuration", videoDuration);
               //we'll let 5s slide in the wacthed video.
              if(results > videoDuration - 5){
                enoughOfVideoWatched = true;
                console.log("the video was watched (within 5s)");
                resolve(enoughOfVideoWatched);
              }else{
                  //not long enough
                  counter++;
                  console.log("session not long enough", counter);

              }
              if(counter == sessionList.length){
                //we've looped through the entire list of sessions.
                console.log("all sessions analyzed, video not watched enough");
                resolve(enoughOfVideoWatched);
              }
            });
            
          }
          
          
                        
         
        }
      }).catch((error) =>{
          reject(error);
      });

  });
}

function sessionTimeWatched(sessionParams, videoDuration){
  return new Promise(function(resolve, reject){
    const sessionData = client.rawStatistics.listSessionEvents(sessionParams);
    sessionData.then( function(lastSessionData) {
      //this is the session data
      console.log("session events", lastSessionData);
      //TODO calculate time watched in the session
      var numberOfEvents = Math.min(lastSessionData.pagination.itemsTotal, 100);
      var summedtime = 0;
      var starttime=0;
      var endtime = 0;
      var startEmit;
      var endEmit;
      var clockTime=0;
      var counting = false;
      var maxWatchedTime = 0;
      for(j=0; j< numberOfEvents; j++){
        if(lastSessionData.data[j].type == "play" || lastSessionData.data[j].type == "resume"){
          //start time measure
          starttime = lastSessionData.data[j].at;
          startEmit=Date.parse(lastSessionData.data[j].emittedAt);
          counting = true;
          console.log ("start" , starttime);
        }else if(lastSessionData.data[j].type == "pause" || lastSessionData.data[j].type == "end"){
          if(counting){
            endtime = lastSessionData.data[j].at;
            endEmit=Date.parse(lastSessionData.data[j].emittedAt);
            counting=false;
            console.log ("stop" , endtime);
            console.log ("added time" , endtime-starttime);
            summedtime += endtime-starttime;
            endtime=starttime=0;
            clockTime += (endEmit- startEmit)/1000;
            
          }
        }else if(lastSessionData.data[j].type == "seek.forward"){
          console.log("seeked forward", (lastSessionData.data[j].to - lastSessionData.data[j].from));
          summedtime -= (lastSessionData.data[j].to - lastSessionData.data[j].from);
          //if there was a seekforward, the max time previously calculated previously is no longer valid and needs to be recalculated.
          maxWatchedTime = 0;
        }
        //console.log("summedtime: ", summedtime);
  
              //summedtime now has the time watched for this session
        if(summedtime > maxWatchedTime){
            maxWatchedTime  = summedtime;
       //     console.log("new max time");
        } 
  //      console.log("summedtime", summedtime + " " + maxWatchedTime);
        
      }
      console.log("summedtime: ", summedtime);
      console.log ("time watched by clock is ", clockTime);
      //if(clockTime > summedtime)
      
      console.log("<Max Time is", maxWatchedTime);
 
      resolve(maxWatchedTime);
    }).catch((error) => {

      reject(error);
    });

  });
}




//testing on 3028
app.listen(3028, () =>
  console.log('Example app listening on port 3028!'),
);

