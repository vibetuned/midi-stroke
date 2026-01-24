For the moment We are being using the sample.mei file to test the the ScoreView.tsx component.
Now we need to create a selector to select the MEI file from the public folder.
This will be first a path selector that for now will only have one path option "first_two_hands_exercices" and second a record selector that will have multiple options.

The path selector will be a list of paths and the record selector will be a list of files in the selected path.

You need to create a json file that will contain the paths and records. based on the public folder structure.

And create a new component that will be used to select the path and record. that will be show after the PianoSetup component.
